import { randomUUID } from 'crypto';
import {
  buildIdempotencyKeyString,
  type BusinessOperationReceipt,
  type LeaseClaim,
  type NotificationOutboxDispatchInput,
  type NotificationReliableOperationPort,
} from '@memoflow/contracts/reliable-messaging';

export interface DurableOutboxRow {
  id: string;
  identityId: string;
  notificationId: string;
  source: string;
  occurrenceKey: string;
  channel: string;
  payloadJson: string;
  idempotencyKey: string;
  status: string;
  attempt: number;
  ownerToken: string | null;
  claimId: string | null;
  fencingToken: number;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  nextRetryAt: Date | null;
  deadLetterAt: Date | null;
  attemptsHistoryJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  correlationId: string | null;
  causationId: string | null;
  lastHeartbeatAt: Date | null;
  heartbeatIntervalMs: number | null;
}

export interface SharedOutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  messageType: string;
  payloadJson: string;
  status: string;
  attempts: number;
  ownerToken: string | null;
  claimId: string | null;
  fencingToken: number;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  nextAvailableAt: Date | null;
  identityId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  correlationId: string;
  causationId: string | null;
  schemaVersion: number;
  availableAt: Date;
  dispatchedAt: Date | null;
  lastHeartbeatAt: Date | null;
}

const TERMINAL_STATUSES = ['succeeded', 'skipped', 'failed', 'cancelled'] as const;

function mapRowToReceipt(row: DurableOutboxRow): BusinessOperationReceipt {
  let lease: LeaseClaim | null = null;
  if (row.leaseExpiresAt && row.ownerToken && row.claimId) {
    lease = {
      schemaVersion: 1,
      resourceKey: `notification:${row.notificationId}:${row.occurrenceKey}`,
      claimId: row.claimId,
      fencingToken: row.fencingToken,
      ownerToken: row.ownerToken,
      expiresAt: row.leaseExpiresAt.toISOString(),
      lastHeartbeatAt: null,
      heartbeatIntervalMs: null,
    };
  }

  let attemptsHistory: unknown[] = [];
  if (row.attemptsHistoryJson) {
    try {
      attemptsHistory = JSON.parse(row.attemptsHistoryJson);
    } catch {
      attemptsHistory = [];
    }
  }

  return {
    schemaVersion: 1,
    operationId: row.id,
    identityId: row.identityId,
    source: row.source,
    occurrenceKey: row.occurrenceKey,
    idempotencyKey: row.idempotencyKey,
    status: row.status as BusinessOperationReceipt['status'],
    attempt: row.attempt,
    lease,
    lastError: row.lastError,
    nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
    deadLetterAt: row.deadLetterAt ? row.deadLetterAt.toISOString() : null,
    correlationId: row.correlationId,
    causationId: row.causationId,
    attemptsHistory: attemptsHistory as BusinessOperationReceipt['attemptsHistory'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/**
 * In-memory implementation of NotificationReliableOperationPort.
 * 内存操作的可靠消息适配器——提供与 Prisma durable adapter 一致的 outbox + lease 语义，
 * 专用于 Desktop / Electron 及单元测试场景（明确标示非持久化）。
 */
export class InMemoryNotificationReliableAdapter implements NotificationReliableOperationPort {
  readonly rows: DurableOutboxRow[] = [];
  readonly sharedOutboxes: SharedOutboxRow[] = [];

  dispatchOutbox(
    input: NotificationOutboxDispatchInput,
    options?: { notificationId?: string },
  ): Promise<BusinessOperationReceipt> {
    const existing = this.rows.find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) return Promise.resolve(mapRowToReceipt(existing));

    const now = new Date();
    const notificationId =
      options?.notificationId ?? (JSON.parse(input.payloadJson)?.notificationId as string | undefined) ?? '';
    const row: DurableOutboxRow = {
      id: input.operationId,
      identityId: input.identityId,
      notificationId,
      source: input.source,
      occurrenceKey: input.occurrenceKey,
      channel: input.channel,
      payloadJson: input.payloadJson,
      idempotencyKey: input.idempotencyKey,
      status: 'pending',
      attempt: 0,
      ownerToken: null,
      claimId: null,
      fencingToken: 0,
      leaseExpiresAt: null,
      lastError: null,
      nextRetryAt: null,
      deadLetterAt: null,
      attemptsHistoryJson: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      correlationId: null,
      causationId: null,
      lastHeartbeatAt: null,
      heartbeatIntervalMs: null,
    };
    this.rows.push(row);
    return Promise.resolve(mapRowToReceipt(row));
  }

  claimOutboxDispatch(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<
    Array<{ claimed: boolean; lease: LeaseClaim | null; receipt: BusinessOperationReceipt; outbox: DurableOutboxRow }>
  > {
    const now = new Date();
    const leaseDurationMs = input.leaseDurationMs ?? 30000;
    const limit = input.limit ?? 50;
    const results: Array<{
      claimed: boolean;
      lease: LeaseClaim | null;
      receipt: BusinessOperationReceipt;
      outbox: DurableOutboxRow;
    }> = [];

    for (const row of this.rows) {
      if (results.length >= limit) break;
      const isDue =
        row.status === 'pending' ||
        (row.status === 'retryable' && (!row.nextRetryAt || row.nextRetryAt.getTime() <= now.getTime())) ||
        (row.status === 'running' && row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() < now.getTime());
      if (!isDue) continue;

      row.status = 'running';
      row.ownerToken = input.ownerToken;
      row.claimId = randomUUID();
      row.fencingToken = (row.fencingToken ?? 0) + 1;
      row.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
      row.nextRetryAt = null;
      row.attempt = (row.attempt ?? 0) + 1;
      row.updatedAt = now;

      const receipt = mapRowToReceipt(row);
      results.push({ claimed: true, lease: receipt.lease, receipt, outbox: { ...row } });
    }
    return Promise.resolve(results);
  }

  recordDeliveryReceipt(
    receipt: BusinessOperationReceipt,
    claimContext?: { ownerToken?: string; fencingToken?: number },
  ): Promise<BusinessOperationReceipt> {
    const row = this.rows.find(
      (r) => r.id === receipt.operationId || r.idempotencyKey === receipt.idempotencyKey,
    );
    if (!row) return Promise.resolve(receipt);

    if (claimContext && (claimContext.ownerToken !== undefined || claimContext.fencingToken !== undefined)) {
      const matches =
        row.status === 'running' &&
        (claimContext.ownerToken === undefined || row.ownerToken === claimContext.ownerToken) &&
        (claimContext.fencingToken === undefined || row.fencingToken === claimContext.fencingToken);
      if (!matches) {
        return Promise.resolve(mapRowToReceipt(row));
      }
    }

    const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(receipt.status);
    row.status = receipt.status;
    row.attempt = receipt.attempt;
    row.lastError = receipt.lastError ?? null;
    row.nextRetryAt = receipt.nextRetryAt ? new Date(receipt.nextRetryAt) : null;
    row.deadLetterAt = receipt.deadLetterAt ? new Date(receipt.deadLetterAt) : null;
    row.finishedAt = receipt.finishedAt
      ? new Date(receipt.finishedAt)
      : isTerminal
        ? new Date()
        : null;
    if (receipt.attemptsHistory) {
      row.attemptsHistoryJson = JSON.stringify(receipt.attemptsHistory);
    }
    if (isTerminal) {
      row.ownerToken = null;
      row.claimId = null;
      row.leaseExpiresAt = null;
    }
    row.updatedAt = new Date();
    return Promise.resolve(mapRowToReceipt(row));
  }

  queryReceipts(
    identityId: string,
    options?: number | { limit?: number; status?: string },
  ): Promise<BusinessOperationReceipt[]> {
    const status = typeof options === 'object' ? options?.status : undefined;
    return Promise.resolve(
      this.rows
        .filter((r) => r.identityId === identityId && (!status || r.status === status))
        .map(mapRowToReceipt),
    );
  }

  queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]> {
    return Promise.resolve(
      this.rows.filter((r) => r.identityId === identityId && r.status === 'dead_letter').map(mapRowToReceipt),
    );
  }

  replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt> {
    const row = this.rows.find(
      (r) => r.id === params.operationId && r.identityId === params.identityId && r.status === 'dead_letter',
    );
    if (!row) {
      return Promise.reject(
        new Error(`Dead letter operation '${params.operationId}' not found for identity '${params.identityId}'`),
      );
    }

    row.status = 'retryable';
    row.fencingToken = (row.fencingToken ?? 0) + 1;
    row.leaseExpiresAt = null;
    row.ownerToken = null;
    row.claimId = null;
    row.deadLetterAt = null;
    row.nextRetryAt = new Date();
    row.updatedAt = new Date();

    return Promise.resolve(mapRowToReceipt(row));
  }

  claimSharedOutboxIntents(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<SharedOutboxRow[]> {
    const now = new Date();
    const leaseDurationMs = input.leaseDurationMs ?? 30000;
    const limit = input.limit ?? 50;
    const claimed: SharedOutboxRow[] = [];

    for (const row of this.sharedOutboxes) {
      if (claimed.length >= limit) break;
      if (row.messageType !== 'notification.requested') continue;

      const isDue =
        row.status === 'pending' ||
        (row.status === 'failed' && (!row.nextAvailableAt || row.nextAvailableAt.getTime() <= now.getTime())) ||
        (row.status === 'running' && row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() < now.getTime());
      if (!isDue) continue;

      row.status = 'running';
      row.ownerToken = input.ownerToken;
      row.claimId = randomUUID();
      row.fencingToken = (row.fencingToken ?? 0) + 1;
      row.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
      row.attempts = (row.attempts ?? 0) + 1;
      row.updatedAt = now;

      claimed.push({ ...row });
    }
    return Promise.resolve(claimed);
  }

  updateSharedOutboxStatus(
    id: string,
    status: string,
    errorMsg?: string | null,
    nextAvailableAt?: Date | null,
    lease?: { ownerToken: string; claimId: string; fencingToken: number } | null,
  ): Promise<'ok' | 'conflict'> {
    const row = this.sharedOutboxes.find((r) => r.id === id);
    if (!row) return Promise.resolve('conflict');

    if (lease) {
      const matches =
        row.status === 'running' &&
        row.ownerToken === lease.ownerToken &&
        row.claimId === lease.claimId &&
        row.fencingToken === lease.fencingToken;
      if (!matches) {
        return Promise.resolve('conflict');
      }
    }

    row.status = status;
    row.lastError = errorMsg ?? null;
    row.nextAvailableAt = nextAvailableAt ?? null;
    row.updatedAt = new Date();

    if (status === 'succeeded' || status === 'dead_letter') {
      row.ownerToken = null;
      row.claimId = null;
      row.leaseExpiresAt = null;
    }

    return Promise.resolve('ok');
  }

  idempotencyKeyFor(identityId: string, occurrenceKey: string): string {
    return buildIdempotencyKeyString({ identityId, source: 'notification', occurrenceKey });
  }
}

export { InMemoryNotificationReliableAdapter as InMemoryReliableAdapter };
