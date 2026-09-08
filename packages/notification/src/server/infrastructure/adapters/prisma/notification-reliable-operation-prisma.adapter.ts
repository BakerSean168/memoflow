/**
 * NotificationReliableOperationPrismaAdapter - Prisma implementation of NotificationReliableOperationPort
 *
 * Implements LeaseClaim semantics, durable dispatch outbox intent persistence,
 * idempotency check, stale owner fencing, dead-letter query & replay, and receipt mapping.
 */

import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient, NotificationDispatchOutbox as PrismaNotificationDispatchOutbox } from '@memoflow/database';
import {
  assertValidBusinessOperationReceipt,
  type BusinessOperationReceipt,
  type DeliveryAttempt,
  type LeaseClaim,
  LeaseFencingException,
  type NotificationOutboxDispatchInput,
  NotificationOutboxDispatchInputSchema,
  type NotificationReliableOperationPort,
} from '@memoflow/contracts/reliable-messaging';
import type { OperationAuditRecordInput, OperationAuditRepository } from '@memoflow/patterns/operations';

function formatResourceKey(notificationId: string, occurrenceKey: string): string {
  return occurrenceKey.startsWith('notification:')
    ? occurrenceKey
    : `notification:${notificationId}:${occurrenceKey}`;
}

/**
 * Stable total-order receipt cursor: `${updatedAtIso}|${operationId}`.
 * `updatedAt` alone is NOT unique under concurrent workers, so the operationId
 * provides the tie-breaker for lossless, collision-free pagination.
 */
export function encodeReceiptCursor(updatedAtIso: string, operationId: string): string {
  return `${updatedAtIso}|${operationId}`;
}

export function decodeReceiptCursor(
  cursor: string | null | undefined,
): { cursorTs: Date; cursorId: string; valid: boolean } {
  const raw = cursor ?? '';
  if (!raw) {
    return { cursorTs: new Date(0), cursorId: '', valid: false };
  }

  const sep = raw.indexOf('|');
  if (sep !== -1) {
    const ts = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!isNaN(ts.getTime()) && id.length > 0) {
      return { cursorTs: ts, cursorId: id, valid: true };
    }
  }

  const colonSep = raw.lastIndexOf(':');
  if (colonSep !== -1) {
    const prefix = raw.slice(0, colonSep);
    const id = raw.slice(colonSep + 1);
    if (/^\d+$/.test(prefix)) {
      const ms = Number(prefix);
      if (!isNaN(ms) && ms > 0 && id.length > 0) {
        return { cursorTs: new Date(ms), cursorId: id, valid: true };
      }
    }
  }

  // Backwards-compatible raw ISO timestamp cursor.
  const ts = new Date(raw);
  if (!isNaN(ts.getTime())) {
    return { cursorTs: ts, cursorId: '', valid: true };
  }

  return { cursorTs: new Date(0), cursorId: '', valid: false };
}

/**
 * Extract an explicit notificationId from the outbox payload's real fields.
 * NEVER derive it from the occurrenceKey prefix: W1 occurrenceKeys
 * (`${templateId}:${time}`) are opaque and have no notification relation.
 */
function extractNotificationIdFromPayload(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson);
    const raw = payload?.notificationId;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
  } catch {
    // fall through: payload is not JSON, no notificationId available
  }
  return null;
}

export function mapPrismaOutboxToReceipt(outbox: PrismaNotificationDispatchOutbox): BusinessOperationReceipt {
  let lease: LeaseClaim | null = null;

  if (outbox.leaseExpiresAt && outbox.ownerToken && outbox.claimId) {
    lease = {
      schemaVersion: 1,
      resourceKey: formatResourceKey(outbox.notificationId, outbox.occurrenceKey),
      claimId: outbox.claimId,
      fencingToken: outbox.fencingToken,
      ownerToken: outbox.ownerToken,
      expiresAt: outbox.leaseExpiresAt.toISOString(),
      lastHeartbeatAt: outbox.lastHeartbeatAt ? outbox.lastHeartbeatAt.toISOString() : null,
      heartbeatIntervalMs: outbox.heartbeatIntervalMs ?? null,
    };
  }

  let attemptsHistory: DeliveryAttempt[] = [];
  if (outbox.attemptsHistoryJson) {
    try {
      attemptsHistory = JSON.parse(outbox.attemptsHistoryJson);
    } catch {
      attemptsHistory = [];
    }
  }

  const rawReceipt = {
    schemaVersion: 1,
    operationId: outbox.id,
    identityId: outbox.identityId,
    source: outbox.source,
    occurrenceKey: outbox.occurrenceKey,
    idempotencyKey: outbox.idempotencyKey,
    status: outbox.status as BusinessOperationReceipt['status'],
    attempt: outbox.attempt,
    lease,
    lastError: outbox.lastError,
    nextRetryAt: outbox.nextRetryAt ? outbox.nextRetryAt.toISOString() : null,
    deadLetterAt: outbox.deadLetterAt ? outbox.deadLetterAt.toISOString() : null,
    correlationId: outbox.correlationId,
    causationId: outbox.causationId,
    attemptsHistory,
    createdAt: outbox.createdAt.toISOString(),
    updatedAt: outbox.updatedAt.toISOString(),
    finishedAt: outbox.finishedAt ? outbox.finishedAt.toISOString() : null,
  };

  return assertValidBusinessOperationReceipt(rawReceipt);
}

export class NotificationReliableOperationPrismaAdapter implements NotificationReliableOperationPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly metricsService?: import('../../../domain/services/notification-metrics-service').NotificationMetricsService,
  ) {}

  /**
   * Dispatch an outbox entry into DB in the given transaction or standard client.
   *
   * `notificationId` MUST be supplied explicitly via `options.notificationId` or
   * inside `payloadJson.notificationId`. Deriving it from the occurrenceKey prefix
   * is forbidden: W1 occurrenceKeys are `${templateId}:${time}` and have no
   * relation to any Notification id. Missing notificationId fails closed.
   */
  async dispatchOutbox(
    input: NotificationOutboxDispatchInput,
    options?: { txClient?: Prisma.TransactionClient; notificationId?: string },
  ): Promise<BusinessOperationReceipt> {
    const validatedInput = NotificationOutboxDispatchInputSchema.parse(input);
    const client = options?.txClient ?? this.prisma;
    const now = new Date();

    const existing = await client.notificationDispatchOutbox.findUnique({
      where: { idempotencyKey: validatedInput.idempotencyKey },
    });

    if (existing) {
      return mapPrismaOutboxToReceipt(existing);
    }

    const notificationId =
      options?.notificationId ?? extractNotificationIdFromPayload(validatedInput.payloadJson);
    if (!notificationId) {
      throw new Error(
        `[FAIL-FAST] dispatchOutbox requires an explicit notificationId (options.notificationId or ` +
          `payloadJson.notificationId). It must NOT be derived from occurrenceKey ` +
          `'${validatedInput.occurrenceKey}'.`,
      );
    }

    try {
      const created = await client.notificationDispatchOutbox.create({
        data: {
          id: validatedInput.operationId,
          identityId: validatedInput.identityId,
          notificationId,
          source: validatedInput.source,
          occurrenceKey: validatedInput.occurrenceKey,
          channel: validatedInput.channel,
          payloadJson: validatedInput.payloadJson,
          idempotencyKey: validatedInput.idempotencyKey,
          status: 'pending',
          attempt: 0,
          fencingToken: 0,
          createdAt: now,
          updatedAt: now,
        },
      });

      this.metricsService?.recordPersisted();

      return mapPrismaOutboxToReceipt(created);
    } catch (err) {
      const reFetched = await client.notificationDispatchOutbox.findUnique({
        where: { idempotencyKey: validatedInput.idempotencyKey },
      });
      if (!reFetched) throw err;
      return mapPrismaOutboxToReceipt(reFetched);
    }
  }

  /**
   * Worker claim method for outbox dispatch.
   */
  async claimOutboxDispatch(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<
    Array<{
      claimed: boolean;
      lease: LeaseClaim | null;
      receipt: BusinessOperationReceipt;
      outbox: PrismaNotificationDispatchOutbox;
    }>
  > {
    const now = new Date();
    const leaseDurationMs = input.leaseDurationMs || 30000;
    const limit = input.limit || 10;

    const candidates = await this.prisma.notificationDispatchOutbox.findMany({
      where: {
        OR: [
          { status: 'pending' },
          {
            status: 'retryable',
            OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null }],
          },
          {
            status: 'running',
            leaseExpiresAt: { lt: now },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const results = [];

    for (const candidate of candidates) {
      const newFencingToken = (candidate.fencingToken || 0) + 1;
      const newClaimId = randomUUID();
      const newLeaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

      const updateResult = await this.prisma.notificationDispatchOutbox.updateMany({
        where: {
          id: candidate.id,
          fencingToken: candidate.fencingToken,
          OR: [
            { status: 'pending' },
            {
              status: 'retryable',
              OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null }],
            },
            {
              status: 'running',
              leaseExpiresAt: { lt: now },
            },
          ],
        },
        data: {
          ownerToken: input.ownerToken,
          claimId: newClaimId,
          fencingToken: newFencingToken,
          leaseExpiresAt: newLeaseExpiresAt,
          lastHeartbeatAt: now,
          heartbeatIntervalMs: Math.max(1, Math.floor(leaseDurationMs / 3)),
          status: 'running',
          nextRetryAt: null,
          attempt: { increment: 1 },
          updatedAt: now,
        },
      });

      if (updateResult.count === 1) {
        const updated = await this.prisma.notificationDispatchOutbox.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        const receipt = mapPrismaOutboxToReceipt(updated);
        results.push({
          claimed: true,
          lease: receipt.lease,
          receipt,
          outbox: updated,
        });
      }
    }

    return results;
  }

  async heartbeatLease(input: {
    claimId: string;
    ownerToken: string;
    fencingToken: number;
    notificationId: string;
    occurrenceKey: string;
    leaseDurationMs?: number;
  }): Promise<{
    renewed: boolean;
    lease: LeaseClaim | null;
    receipt: BusinessOperationReceipt;
  }> {
    const now = new Date();
    const leaseDurationMs = input.leaseDurationMs || 30000;
    const newLeaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const result = await this.prisma.notificationDispatchOutbox.updateMany({
      where: {
        OR: [{ claimId: input.claimId }, { id: input.claimId }],
        ownerToken: input.ownerToken,
        fencingToken: input.fencingToken,
        status: 'running',
        leaseExpiresAt: { gt: now },
      },
      data: {
        lastHeartbeatAt: now,
        leaseExpiresAt: newLeaseExpiresAt,
        updatedAt: now,
      },
    });

    if (result.count === 1) {
      const updated = await this.prisma.notificationDispatchOutbox.findFirstOrThrow({
        where: { OR: [{ claimId: input.claimId }, { id: input.claimId }] },
      });
      const receipt = mapPrismaOutboxToReceipt(updated);
      return { renewed: true, lease: receipt.lease, receipt };
    }

    const existing = await this.prisma.notificationDispatchOutbox.findFirst({
      where: { OR: [{ claimId: input.claimId }, { id: input.claimId }] },
    });

    if (!existing) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Dispatch Outbox '${input.claimId}' not found.`,
      );
    }

    if (existing.fencingToken !== input.fencingToken) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Stale fencing token: expected ${input.fencingToken}, active is ${existing.fencingToken}`,
        existing.fencingToken,
        input.fencingToken,
      );
    }

    if (existing.ownerToken !== input.ownerToken) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Owner token mismatch: active owner is '${existing.ownerToken}', incoming is '${input.ownerToken}'`,
      );
    }

    const receipt = mapPrismaOutboxToReceipt(existing);
    return { renewed: false, lease: null, receipt };
  }

  async recordDeliveryReceipt(
    receipt: BusinessOperationReceipt,
    claimContext?: { ownerToken?: string; fencingToken?: number },
  ): Promise<BusinessOperationReceipt> {
    const validatedReceipt = assertValidBusinessOperationReceipt(receipt);
    const isTerminal = ['succeeded', 'skipped', 'failed', 'cancelled', 'dead_letter'].includes(validatedReceipt.status);

    const ownerToken = claimContext?.ownerToken ?? validatedReceipt.lease?.ownerToken;
    const fencingToken = claimContext?.fencingToken ?? validatedReceipt.lease?.fencingToken;

    const whereCondition: Prisma.NotificationDispatchOutboxWhereInput = {
      idempotencyKey: validatedReceipt.idempotencyKey,
    };

    if (validatedReceipt.operationId) {
      whereCondition.id = validatedReceipt.operationId;
    }

    if (ownerToken !== undefined && ownerToken !== null) {
      whereCondition.ownerToken = ownerToken;
    }

    if (fencingToken !== undefined && fencingToken !== null) {
      whereCondition.fencingToken = fencingToken;
    }

    // Worker terminal/retryable updates must transition from 'running' state
    if (ownerToken !== undefined || fencingToken !== undefined) {
      whereCondition.status = 'running';
    }

    const result = await this.prisma.notificationDispatchOutbox.updateMany({
      where: whereCondition,
      data: {
        status: validatedReceipt.status,
        attempt: validatedReceipt.attempt,
        lastError: validatedReceipt.lastError,
        nextRetryAt: validatedReceipt.nextRetryAt ? new Date(validatedReceipt.nextRetryAt) : null,
        deadLetterAt: validatedReceipt.deadLetterAt ? new Date(validatedReceipt.deadLetterAt) : null,
        finishedAt: validatedReceipt.finishedAt
          ? new Date(validatedReceipt.finishedAt)
          : isTerminal && validatedReceipt.status !== 'dead_letter'
            ? new Date()
            : null,
        ownerToken: isTerminal ? null : (ownerToken ?? null),
        claimId: isTerminal ? null : (validatedReceipt.lease?.claimId ?? null),
        leaseExpiresAt: isTerminal ? null : (validatedReceipt.lease?.expiresAt ? new Date(validatedReceipt.lease.expiresAt) : null),
        attemptsHistoryJson: validatedReceipt.attemptsHistory ? JSON.stringify(validatedReceipt.attemptsHistory) : null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 1) {
      const updated = await this.prisma.notificationDispatchOutbox.findUniqueOrThrow({
        where: { idempotencyKey: validatedReceipt.idempotencyKey },
      });
      const ret = mapPrismaOutboxToReceipt(updated);
      (ret as unknown as Record<string, unknown>).applied = true;
      return ret;
    }

    // Condition failed (preempted / lost lease / already terminal): return existing state without duplicate delivery
    const existing = await this.prisma.notificationDispatchOutbox.findFirst({
      where: {
        OR: [
          { idempotencyKey: validatedReceipt.idempotencyKey },
          { id: validatedReceipt.operationId },
        ],
      },
    });
    if (!existing) {
      const ret = { ...validatedReceipt };
      (ret as unknown as Record<string, unknown>).applied = false;
      return ret;
    }
    const ret = mapPrismaOutboxToReceipt(existing);
    (ret as unknown as Record<string, unknown>).applied = false;
    return ret;
  }

  async queryReceipts(
    identityId: string,
    options?: number | { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<BusinessOperationReceipt[]> {
    if (!identityId) {
      throw new Error('identityId is required');
    }
    const limit = typeof options === 'number' ? options : options?.limit ?? 50;
    const lastCursor = typeof options === 'object' ? (options?.lastCursor ?? options?.since) : undefined;
    const status = typeof options === 'object' ? options?.status : undefined;

    const whereCondition: Prisma.NotificationDispatchOutboxWhereInput = {
      identityId,
    };

    if (status) {
      whereCondition.status = status;
    }

    if (lastCursor) {
      const { cursorTs, cursorId, valid } = decodeReceiptCursor(lastCursor);
      if (valid && cursorTs.getTime() >= 0) {
        if (cursorId) {
          const nextMs = new Date(cursorTs.getTime() + 1);
          whereCondition.OR = [
            { updatedAt: { gte: nextMs } },
            { updatedAt: { gte: cursorTs, lt: nextMs }, id: { gt: cursorId } },
          ];
        } else if (cursorTs.getTime() > 0) {
          whereCondition.updatedAt = { gt: cursorTs };
        }
      }
    }

    const rows = await this.prisma.notificationDispatchOutbox.findMany({
      where: whereCondition,
      orderBy: lastCursor
        ? [{ updatedAt: 'asc' }, { id: 'asc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map(mapPrismaOutboxToReceipt);
  }

  async queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]> {
    if (!identityId) {
      throw new Error('identityId is required');
    }
    const deadLetters = await this.prisma.notificationDispatchOutbox.findMany({
      where: {
        identityId,
        status: 'dead_letter',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    return deadLetters.map(mapPrismaOutboxToReceipt);
  }

  async replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt> {
    const { identityId, operationId } = params;
    const now = new Date();

    const existing = await this.prisma.notificationDispatchOutbox.findFirst({
      where: {
        id: operationId,
        identityId,
        status: 'dead_letter',
      },
    });

    if (!existing) {
      throw new Error(
        `Dead letter notification outbox not found for operationId '${operationId}' and identityId '${identityId}'`,
      );
    }

    const updateResult = await this.prisma.notificationDispatchOutbox.updateMany({
      where: {
        id: existing.id,
        identityId,
        status: 'dead_letter',
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'retryable',
        nextRetryAt: new Date(now.getTime() - 1000),
        deadLetterAt: null,
        ownerToken: null,
        claimId: null,
        leaseExpiresAt: null,
        fencingToken: { increment: 1 },
        updatedAt: now,
      },
    });

    if (updateResult.count === 0) {
      const reFetched = await this.prisma.notificationDispatchOutbox.findUniqueOrThrow({
        where: { id: existing.id },
      });
      return mapPrismaOutboxToReceipt(reFetched);
    }

    const updated = await this.prisma.notificationDispatchOutbox.findUniqueOrThrow({
      where: { id: existing.id },
    });

    return mapPrismaOutboxToReceipt(updated);
  }

  /**
   * P1-4：与审计同一事务的 replay。状态推进与 audit 事实同入一个
   * `prisma.$transaction`；审计写失败时整个事务回滚，绝不留下
   * “已重放但无审计”的部分成功。
   */
  async replayDeadLetterWithAudit(
    params: { identityId: string; operationId: string },
    audit: OperationAuditRecordInput,
    auditRepository: OperationAuditRepository,
  ): Promise<BusinessOperationReceipt> {
    return this.prisma.$transaction(async (tx) => {
      const { identityId, operationId } = params;
      const now = new Date();

      const existing = await tx.notificationDispatchOutbox.findFirst({
        where: {
          id: operationId,
          identityId,
          status: 'dead_letter',
        },
      });

      if (!existing) {
        throw new Error(
          `Dead letter notification outbox not found for operationId '${operationId}' and identityId '${identityId}'`,
        );
      }

      const updateResult = await tx.notificationDispatchOutbox.updateMany({
        where: {
          id: existing.id,
          identityId,
          status: 'dead_letter',
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: {
          status: 'retryable',
          nextRetryAt: new Date(now.getTime() - 1000),
          deadLetterAt: null,
          ownerToken: null,
          claimId: null,
          leaseExpiresAt: null,
          fencingToken: { increment: 1 },
          updatedAt: now,
        },
      });

      let receipt: BusinessOperationReceipt;
      if (updateResult.count === 0) {
        const reFetched = await tx.notificationDispatchOutbox.findUniqueOrThrow({
          where: { id: existing.id },
        });
        receipt = mapPrismaOutboxToReceipt(reFetched);
      } else {
        const updated = await tx.notificationDispatchOutbox.findUniqueOrThrow({
          where: { id: existing.id },
        });
        receipt = mapPrismaOutboxToReceipt(updated);
      }

      await auditRepository.record(
        {
          ...audit,
          details: `status -> ${receipt.status}`,
        },
        tx,
      );
      return receipt;
    });
  }

  /**
   * Claim canonical cross-module `notification.requested` rows from the shared OutboxMessage table.
   *
   * A claim is a conditional write: only rows without an active lease
   * (`leaseExpiresAt IS NULL OR leaseExpiresAt < now`) may be claimed. On success the
   * row is fenced with `ownerToken`/`claimId`/`fencingToken` and a fresh
   * `leaseExpiresAt` deadline, so a worker owns it exclusively until the lease expires.
   * This makes the consumer recoverable after a crash
   * (claim -> crash -> lease expiry -> re-claim) instead of being permanently stuck
   * in `running`.
   */
  async claimSharedOutboxIntents(input: {
    ownerToken: string;
    limit?: number;
    leaseDurationMs?: number;
  }): Promise<Array<import('@memoflow/database').OutboxMessage>> {
    const now = new Date();
    const limit = input.limit || 10;
    const leaseDurationMs = input.leaseDurationMs ?? 30000;
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const candidates = await this.prisma.outboxMessage.findMany({
      where: {
        messageType: 'notification.requested',
        AND: [
          {
            OR: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { lt: now } },
            ],
          },
          {
            OR: [
              { status: 'pending' },
              {
                status: 'retryable',
                availableAt: { lte: now },
              },
              {
                status: 'running',
                availableAt: { lte: now },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const claimed: Array<import('@memoflow/database').OutboxMessage> = [];

    for (const candidate of candidates) {
      const updateResult = await this.prisma.outboxMessage.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          attempts: candidate.attempts,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'running',
          attempts: { increment: 1 },
          dispatchedAt: now,
          availableAt: leaseExpiresAt,
          ownerToken: input.ownerToken,
          claimId: randomUUID(),
          fencingToken: (candidate.fencingToken ?? 0) + 1,
          leaseExpiresAt,
        },
      });

      if (updateResult.count === 1) {
        const updated = await this.prisma.outboxMessage.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        claimed.push(updated);
      }
    }

    return claimed;
  }

  /**
   * Update shared OutboxMessage status after delivery processing.
   *
   * Conditional write: the row is only transitioned when it is still owned by the
   * caller's lease (`ownerToken` + `claimId` + `fencingToken` match) and still
   * `running`. If the lease was lost or the row was re-claimed by another worker,
   * nothing is overwritten and a `'conflict'` marker is returned. The lease is
   * released on a successful transition.
   */
  async updateSharedOutboxStatus(
    id: string,
    status: 'succeeded' | 'retryable' | 'dead_letter',
    errorMsg?: string | null,
    nextAvailableAt?: Date | null,
    lease?: { ownerToken: string; claimId: string; fencingToken: number } | null,
  ): Promise<'ok' | 'conflict'> {
    const now = new Date();
    if (!lease) {
      return 'conflict';
    }
    const where: Prisma.OutboxMessageWhereInput = {
      id,
      status: 'running',
      ownerToken: lease.ownerToken,
      claimId: lease.claimId,
      fencingToken: lease.fencingToken,
    };

    const updateResult = await this.prisma.outboxMessage.updateMany({
      where,
      data: {
        status,
        lastError: errorMsg ?? null,
        availableAt: nextAvailableAt ?? now,
        dispatchedAt: status === 'succeeded' ? now : undefined,
        ownerToken: null,
        claimId: null,
        leaseExpiresAt: null,
      },
    });

    return updateResult.count === 0 ? 'conflict' : 'ok';
  }

  async querySucceededOutboxes(options?: number | { limit?: number; lastCursor?: string }) {
    const limit = typeof options === 'number' ? options : options?.limit ?? 50;
    const lastCursor = typeof options === 'object' ? options?.lastCursor : undefined;

    const where: Prisma.NotificationDispatchOutboxWhereInput = {
      status: 'succeeded',
      notification: {
        channels: {
          some: {
            OR: [
              { response: null },
              { response: '' },
              { status: { notIn: ['Delivered', 'Sent'] } },
            ],
          },
        },
      },
    };

    if (lastCursor) {
      const { cursorTs, cursorId, valid } = decodeReceiptCursor(lastCursor);
      if (valid && cursorTs.getTime() >= 0) {
        where.AND = [
          {
            OR: [
              { updatedAt: { gt: cursorTs } },
              { updatedAt: cursorTs, id: { gt: cursorId } },
            ],
          },
        ];
      }
    }

    return this.prisma.notificationDispatchOutbox.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }
}

