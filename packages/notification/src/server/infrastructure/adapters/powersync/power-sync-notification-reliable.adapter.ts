/**
 * PowerSyncNotificationReliableAdapter - PowerSync / SQLite implementation of NotificationReliableOperationPort.
 * PowerSync / SQLite 实现的 NotificationReliableOperationPort。
 *
 * Implements LeaseClaim semantics, durable outbox intent persistence, idempotency check,
 * stale owner fencing, dead-letter query & replay, and receipt mapping for Electron desktop databases.
 */

import { randomUUID } from 'crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  type BusinessOperationReceipt,
  type DeliveryAttempt,
  type LeaseClaim,
  LeaseFencingException,
  type NotificationOutboxDispatchInput,
  NotificationOutboxDispatchInputSchema,
  type NotificationReliableOperationPort,
} from '@memoflow/contracts/reliable-messaging';
import type { NotificationMetricsService } from '../../../domain/services/notification-metrics-service';

export interface PowerSyncOutboxRow {
  id: string;
  identity_id: string;
  notification_id: string;
  source: string;
  occurrence_key: string;
  channel: string;
  payload_json: string;
  idempotency_key: string;
  status: string;
  attempt: number;
  owner_token: string | null;
  claim_id: string | null;
  fencing_token: number;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  heartbeat_interval_ms: number | null;
  last_error: string | null;
  next_retry_at: string | null;
  dead_letter_at: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  attempts_history_json: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/**
 * Shared outbox (outbox_messages) row.
 *
 * Field semantics follow the Prisma/PostgreSQL shared outbox (OutboxMessage):
 *  - `next_retry_at` is the single backoff/availability column: a row is claimable
 *    again only when `next_retry_at IS NULL OR next_retry_at <= now`. On claim it is
 *    set to the lease deadline (row is not reclaimable while the lease is live), on
 *    completion it is set to the next available time (retry backoff) or now (terminal).
 *  - `lease_expires_at` is the exclusive lease deadline (fencing window).
 *  - There is deliberately NO second `available_at`/`next_available_at` column:
 *    splitting the same timestamp across two columns lets backoff be ignored, which
 *    is exactly the Prisma-semantics mismatch this row shape must not reintroduce.
 */
export interface PowerSyncSharedOutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  message_type: string;
  payload_json: string;
  status: string;
  attempts: number;
  owner_token: string | null;
  claim_id: string | null;
  fencing_token: number;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  last_error: string | null;
  next_retry_at: string | null;
  identity_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  correlation_id: string;
  causation_id: string | null;
  schema_version: number;
  dispatched_at: string | null;
}

function formatResourceKey(notificationId: string, occurrenceKey: string): string {
  return occurrenceKey.startsWith('notification:')
    ? occurrenceKey
    : `notification:${notificationId}:${occurrenceKey}`;
}

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

  const ts = new Date(raw);
  if (!isNaN(ts.getTime())) {
    return { cursorTs: ts, cursorId: '', valid: true };
  }

  return { cursorTs: new Date(0), cursorId: '', valid: false };
}

function extractNotificationIdFromPayload(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson);
    const raw = payload?.notificationId;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
  } catch {
    // fall through
  }
  return null;
}

export function mapPowerSyncOutboxToReceipt(row: PowerSyncOutboxRow): BusinessOperationReceipt {
  let lease: LeaseClaim | null = null;

  if (row.lease_expires_at && row.owner_token && row.claim_id) {
    lease = {
      schemaVersion: 1,
      resourceKey: formatResourceKey(row.notification_id, row.occurrence_key),
      claimId: row.claim_id,
      fencingToken: Number(row.fencing_token ?? 0),
      ownerToken: row.owner_token,
      expiresAt: new Date(row.lease_expires_at).toISOString(),
      lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at).toISOString() : null,
      heartbeatIntervalMs: row.heartbeat_interval_ms ? Number(row.heartbeat_interval_ms) : null,
    };
  }

  let attemptsHistory: DeliveryAttempt[] = [];
  if (row.attempts_history_json) {
    try {
      attemptsHistory = JSON.parse(row.attempts_history_json);
    } catch {
      attemptsHistory = [];
    }
  }

  const rawReceipt = {
    schemaVersion: 1,
    operationId: row.id,
    identityId: row.identity_id,
    source: row.source,
    occurrenceKey: row.occurrence_key,
    idempotencyKey: row.idempotency_key,
    status: row.status as BusinessOperationReceipt['status'],
    attempt: Number(row.attempt ?? 0),
    lease,
    lastError: row.last_error ?? null,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at).toISOString() : null,
    deadLetterAt: row.dead_letter_at ? new Date(row.dead_letter_at).toISOString() : null,
    correlationId: row.correlation_id ?? null,
    causationId: row.causation_id ?? null,
    attemptsHistory,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };

  return assertValidBusinessOperationReceipt(rawReceipt);
}

export function mapPowerSyncOutboxToNotificationDispatchOutbox(
  row: PowerSyncOutboxRow,
): import('@memoflow/database').NotificationDispatchOutbox {
  return {
    id: row.id,
    identityId: row.identity_id,
    notificationId: row.notification_id,
    source: row.source,
    occurrenceKey: row.occurrence_key,
    channel: row.channel,
    payloadJson: row.payload_json,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attempt: Number(row.attempt ?? 0),
    ownerToken: row.owner_token ?? null,
    claimId: row.claim_id ?? null,
    fencingToken: Number(row.fencing_token ?? 0),
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
    lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null,
    heartbeatIntervalMs: row.heartbeat_interval_ms ? Number(row.heartbeat_interval_ms) : null,
    lastError: row.last_error ?? null,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    deadLetterAt: row.dead_letter_at ? new Date(row.dead_letter_at) : null,
    correlationId: row.correlation_id ?? null,
    causationId: row.causation_id ?? null,
    attemptsHistoryJson: row.attempts_history_json ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
  };
}

export function mapPowerSyncSharedOutboxToOutboxMessage(
  row: PowerSyncSharedOutboxRow,
): import('@memoflow/database').OutboxMessage {
  return {
    id: row.id,
    identityId: row.identity_id ?? null,
    messageType: row.message_type,
    schemaVersion: Number(row.schema_version ?? 1),
    correlationId: row.correlation_id,
    causationId: row.causation_id ?? null,
    payloadJson: row.payload_json,
    idempotencyKey: row.idempotency_key ?? null,
    status: row.status,
    attempts: Number(row.attempts ?? 0),
    // `next_retry_at` carries the OutboxMessage.availableAt availability semantics:
    // the earliest time the row may be processed again (lease boundary while
    // running, backoff deadline while retryable). Falls back to created_at for
    // rows that have never been claimed (NULL backoff column).
    availableAt: new Date(row.next_retry_at || row.created_at),
    lastError: row.last_error ?? null,
    dispatchedAt: row.dispatched_at ? new Date(row.dispatched_at) : null,
    createdAt: new Date(row.created_at),
    ownerToken: row.owner_token ?? null,
    claimId: row.claim_id ?? null,
    fencingToken: row.fencing_token ? Number(row.fencing_token) : null,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
    lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null,
  };
}

export class PowerSyncNotificationReliableAdapter implements NotificationReliableOperationPort {
  private tableInitialized = false;

  constructor(
    private readonly db: IElectronDatabase,
    private readonly metricsService?: NotificationMetricsService,
  ) {}

  private async ensureTablesExist(): Promise<void> {
    if (this.tableInitialized) return;
    // `notification_dispatch_outbox` and `desktop_delivery_acks` are owned by the
    // canonical PowerSync schema. At runtime they are writable SQLite views, so
    // this adapter must never try to create tables or indexes for them. Only the
    // shared `outbox_messages` table is adapter-owned local SQLite state.
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id TEXT PRIMARY KEY,
        aggregate_type TEXT NOT NULL DEFAULT 'shared',
        aggregate_id TEXT NOT NULL DEFAULT 'shared',
        message_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        owner_token TEXT,
        claim_id TEXT,
        fencing_token INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TEXT,
        last_error TEXT,
        next_retry_at TEXT,
        identity_id TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL DEFAULT '',
        causation_id TEXT,
        schema_version INTEGER NOT NULL DEFAULT 1,
        dispatched_at TEXT
      );
    `);
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_om_message_type ON outbox_messages(message_type);`,
    );
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_om_status ON outbox_messages(status);`,
    );
    this.tableInitialized = true;
  }

  async dispatchOutbox(
    input: NotificationOutboxDispatchInput,
    options?: { notificationId?: string },
  ): Promise<BusinessOperationReceipt> {
    await this.ensureTablesExist();
    const validatedInput = NotificationOutboxDispatchInputSchema.parse(input);
    const nowIso = new Date().toISOString();

    const existing = await this.db.getOptional<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE idempotency_key = ? LIMIT 1`,
      [validatedInput.idempotencyKey],
    );
    if (existing) {
      return mapPowerSyncOutboxToReceipt(existing);
    }

    const notificationId =
      options?.notificationId ?? extractNotificationIdFromPayload(validatedInput.payloadJson);
    if (!notificationId) {
      throw new Error(
        `[FAIL-FAST] dispatchOutbox requires an explicit notificationId (options.notificationId or payloadJson.notificationId). ` +
          `It must NOT be derived from occurrenceKey '${validatedInput.occurrenceKey}'.`,
      );
    }

    try {
      await this.db.execute(
        `INSERT INTO notification_dispatch_outbox (
          id, identity_id, notification_id, source, occurrence_key, channel,
          payload_json, idempotency_key, status, attempt, fencing_token, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)`,
        [
          validatedInput.operationId,
          validatedInput.identityId,
          notificationId,
          validatedInput.source,
          validatedInput.occurrenceKey,
          validatedInput.channel,
          validatedInput.payloadJson,
          validatedInput.idempotencyKey,
          nowIso,
          nowIso,
        ],
      );

      this.metricsService?.recordPersisted();

      const created = await this.db.get<PowerSyncOutboxRow>(
        `SELECT * FROM notification_dispatch_outbox WHERE id = ? LIMIT 1`,
        [validatedInput.operationId],
      );
      return mapPowerSyncOutboxToReceipt(created);
    } catch (err) {
      const reFetched = await this.db.getOptional<PowerSyncOutboxRow>(
        `SELECT * FROM notification_dispatch_outbox WHERE idempotency_key = ? LIMIT 1`,
        [validatedInput.idempotencyKey],
      );
      if (!reFetched) throw err;
      return mapPowerSyncOutboxToReceipt(reFetched);
    }
  }

  async claimOutboxDispatch(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<
    Array<{
      claimed: boolean;
      lease: LeaseClaim | null;
      receipt: BusinessOperationReceipt;
      outbox: import('@memoflow/database').NotificationDispatchOutbox;
    }>
  > {
    await this.ensureTablesExist();
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseDurationMs = input.leaseDurationMs || 30000;
    const limit = input.limit || 10;

    const candidates = await this.db.getAll<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox
        WHERE status = 'pending'
           OR (status = 'retryable' AND (next_retry_at IS NULL OR next_retry_at <= ?))
           OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
        ORDER BY created_at ASC
        LIMIT ?`,
      [nowIso, nowIso, limit],
    );

    const results = [];

    for (const candidate of candidates) {
      const newFencingToken = (candidate.fencing_token || 0) + 1;
      const newClaimId = randomUUID();
      const newLeaseExpiresAtIso = new Date(now.getTime() + leaseDurationMs).toISOString();

      const result = await this.db.execute(
        `UPDATE notification_dispatch_outbox
            SET owner_token = ?,
                claim_id = ?,
                fencing_token = ?,
                lease_expires_at = ?,
                last_heartbeat_at = ?,
                heartbeat_interval_ms = ?,
                status = 'running',
                next_retry_at = NULL,
                attempt = attempt + 1,
                updated_at = ?
          WHERE id = ?
            AND fencing_token = ?
            AND (
              status = 'pending'
              OR (status = 'retryable' AND (next_retry_at IS NULL OR next_retry_at <= ?))
              OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
            )`,
        [
          input.ownerToken,
          newClaimId,
          newFencingToken,
          newLeaseExpiresAtIso,
          nowIso,
          Math.max(1, Math.floor(leaseDurationMs / 3)),
          nowIso,
          candidate.id,
          candidate.fencing_token,
          nowIso,
          nowIso,
        ],
      );

      if (result.rowsAffected === 1) {
        const updated = await this.db.get<PowerSyncOutboxRow>(
          `SELECT * FROM notification_dispatch_outbox WHERE id = ? LIMIT 1`,
          [candidate.id],
        );
        const receipt = mapPowerSyncOutboxToReceipt(updated);
        results.push({
          claimed: true,
          lease: receipt.lease,
          receipt,
          outbox: mapPowerSyncOutboxToNotificationDispatchOutbox(updated),
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
    await this.ensureTablesExist();
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseDurationMs = input.leaseDurationMs || 30000;
    const newLeaseExpiresAtIso = new Date(now.getTime() + leaseDurationMs).toISOString();

    const result = await this.db.execute(
      `UPDATE notification_dispatch_outbox
          SET last_heartbeat_at = ?,
              lease_expires_at = ?,
              updated_at = ?
        WHERE (claim_id = ? OR id = ?)
          AND owner_token = ?
          AND fencing_token = ?
          AND status = 'running'
          AND lease_expires_at > ?`,
      [
        nowIso,
        newLeaseExpiresAtIso,
        nowIso,
        input.claimId,
        input.claimId,
        input.ownerToken,
        input.fencingToken,
        nowIso,
      ],
    );

    if (result.rowsAffected === 1) {
      const updated = await this.db.get<PowerSyncOutboxRow>(
        `SELECT * FROM notification_dispatch_outbox WHERE claim_id = ? OR id = ? LIMIT 1`,
        [input.claimId, input.claimId],
      );
      const receipt = mapPowerSyncOutboxToReceipt(updated);
      return { renewed: true, lease: receipt.lease, receipt };
    }

    const existing = await this.db.getOptional<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE claim_id = ? OR id = ? LIMIT 1`,
      [input.claimId, input.claimId],
    );

    if (!existing) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Dispatch Outbox '${input.claimId}' not found.`,
      );
    }

    if (existing.fencing_token !== input.fencingToken) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Stale fencing token: expected ${input.fencingToken}, active is ${existing.fencing_token}`,
        existing.fencing_token,
        input.fencingToken,
      );
    }

    if (existing.owner_token !== input.ownerToken) {
      throw new LeaseFencingException(
        formatResourceKey(input.notificationId, input.occurrenceKey),
        `Owner token mismatch: active owner is '${existing.owner_token}', incoming is '${input.ownerToken}'`,
      );
    }

    const receipt = mapPowerSyncOutboxToReceipt(existing);
    return { renewed: false, lease: null, receipt };
  }

  async recordDeliveryReceipt(
    receipt: BusinessOperationReceipt,
    claimContext?: { ownerToken?: string; fencingToken?: number },
  ): Promise<BusinessOperationReceipt> {
    await this.ensureTablesExist();
    const validatedReceipt = assertValidBusinessOperationReceipt(receipt);
    const isTerminal = ['succeeded', 'skipped', 'failed', 'cancelled', 'dead_letter'].includes(
      validatedReceipt.status,
    );

    const ownerToken = claimContext?.ownerToken ?? validatedReceipt.lease?.ownerToken;
    const fencingToken = claimContext?.fencingToken ?? validatedReceipt.lease?.fencingToken;
    const nowIso = new Date().toISOString();

    const whereClauses: string[] = ['(idempotency_key = ? OR id = ?)'];
    const params: unknown[] = [validatedReceipt.idempotencyKey, validatedReceipt.operationId];

    if (ownerToken !== undefined && ownerToken !== null) {
      whereClauses.push('owner_token = ?');
      params.push(ownerToken);
    }

    if (fencingToken !== undefined && fencingToken !== null) {
      whereClauses.push('fencing_token = ?');
      params.push(fencingToken);
    }

    if (ownerToken !== undefined || fencingToken !== undefined) {
      whereClauses.push("status = 'running'");
    }

    const finishedAtIso = validatedReceipt.finishedAt
      ? new Date(validatedReceipt.finishedAt).toISOString()
      : isTerminal && validatedReceipt.status !== 'dead_letter'
        ? nowIso
        : null;

    const setClauses: string[] = [
      'status = ?',
      'attempt = ?',
      'last_error = ?',
      'next_retry_at = ?',
      'dead_letter_at = ?',
      'finished_at = ?',
      'owner_token = ?',
      'claim_id = ?',
      'lease_expires_at = ?',
      'attempts_history_json = ?',
      'updated_at = ?',
    ];

    const updateParams = [
      validatedReceipt.status,
      validatedReceipt.attempt,
      validatedReceipt.lastError ?? null,
      validatedReceipt.nextRetryAt ? new Date(validatedReceipt.nextRetryAt).toISOString() : null,
      validatedReceipt.deadLetterAt ? new Date(validatedReceipt.deadLetterAt).toISOString() : null,
      finishedAtIso,
      isTerminal ? null : (ownerToken ?? null),
      isTerminal ? null : (validatedReceipt.lease?.claimId ?? null),
      isTerminal
        ? null
        : validatedReceipt.lease?.expiresAt
          ? new Date(validatedReceipt.lease.expiresAt).toISOString()
          : null,
      validatedReceipt.attemptsHistory ? JSON.stringify(validatedReceipt.attemptsHistory) : null,
      nowIso,
      ...params,
    ];

    const result = await this.db.execute(
      `UPDATE notification_dispatch_outbox SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`,
      updateParams,
    );

    if (result.rowsAffected === 1) {
      const updated = await this.db.get<PowerSyncOutboxRow>(
        `SELECT * FROM notification_dispatch_outbox WHERE idempotency_key = ? OR id = ? LIMIT 1`,
        [validatedReceipt.idempotencyKey, validatedReceipt.operationId],
      );
      const ret = mapPowerSyncOutboxToReceipt(updated);
      (ret as unknown as Record<string, unknown>).applied = true;
      return ret;
    }

    const existing = await this.db.getOptional<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE idempotency_key = ? OR id = ? LIMIT 1`,
      [validatedReceipt.idempotencyKey, validatedReceipt.operationId],
    );
    if (!existing) {
      const ret = { ...validatedReceipt };
      (ret as unknown as Record<string, unknown>).applied = false;
      return ret;
    }
    const ret = mapPowerSyncOutboxToReceipt(existing);
    (ret as unknown as Record<string, unknown>).applied = false;
    return ret;
  }

  async queryReceipts(
    identityId: string,
    options?: number | { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<BusinessOperationReceipt[]> {
    await this.ensureTablesExist();
    if (!identityId) {
      throw new Error('identityId is required');
    }
    const limit = typeof options === 'number' ? options : options?.limit ?? 50;
    const lastCursor = typeof options === 'object' ? (options?.lastCursor ?? options?.since) : undefined;
    const status = typeof options === 'object' ? options?.status : undefined;

    const whereClauses: string[] = ['identity_id = ?'];
    const params: unknown[] = [identityId];

    if (status) {
      whereClauses.push('status = ?');
      params.push(status);
    }

    let orderBy = 'ORDER BY updated_at DESC, id DESC';

    if (lastCursor) {
      const { cursorTs, cursorId, valid } = decodeReceiptCursor(lastCursor);
      if (valid && cursorTs.getTime() >= 0) {
        const cursorIso = cursorTs.toISOString();
        if (cursorId) {
          whereClauses.push('(updated_at > ? OR (updated_at = ? AND id > ?))');
          params.push(cursorIso, cursorIso, cursorId);
        } else if (cursorTs.getTime() > 0) {
          whereClauses.push('updated_at > ?');
          params.push(cursorIso);
        }
        orderBy = 'ORDER BY updated_at ASC, id ASC';
      }
    }

    params.push(limit);
    const sql = `SELECT * FROM notification_dispatch_outbox WHERE ${whereClauses.join(' AND ')} ${orderBy} LIMIT ?`;
    const rows = await this.db.getAll<PowerSyncOutboxRow>(sql, params);
    return rows.map(mapPowerSyncOutboxToReceipt);
  }

  async queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]> {
    await this.ensureTablesExist();
    if (!identityId) {
      throw new Error('identityId is required');
    }
    const rows = await this.db.getAll<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE identity_id = ? AND status = 'dead_letter' ORDER BY updated_at DESC`,
      [identityId],
    );
    return rows.map(mapPowerSyncOutboxToReceipt);
  }

  async replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt> {
    await this.ensureTablesExist();
    const { identityId, operationId } = params;
    const now = new Date();
    const nowIso = now.toISOString();

    const existing = await this.db.getOptional<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE id = ? AND identity_id = ? AND status = 'dead_letter' LIMIT 1`,
      [operationId, identityId],
    );

    if (!existing) {
      throw new Error(
        `Dead letter notification outbox not found for operationId '${operationId}' and identityId '${identityId}'`,
      );
    }

    const nextRetryIso = new Date(now.getTime() - 1000).toISOString();

    const updateResult = await this.db.execute(
      `UPDATE notification_dispatch_outbox
          SET status = 'retryable',
              next_retry_at = ?,
              dead_letter_at = NULL,
              owner_token = NULL,
              claim_id = NULL,
              lease_expires_at = NULL,
              fencing_token = fencing_token + 1,
              updated_at = ?
        WHERE id = ?
          AND identity_id = ?
          AND status = 'dead_letter'
          AND (lease_expires_at IS NULL OR lease_expires_at < ?)`,
      [nextRetryIso, nowIso, existing.id, identityId, nowIso],
    );

    if (updateResult.rowsAffected === 0) {
      const current = await this.db.getOptional<PowerSyncOutboxRow>(
        `SELECT * FROM notification_dispatch_outbox WHERE id = ? LIMIT 1`,
        [existing.id],
      );
      if (current) {
        return mapPowerSyncOutboxToReceipt(current);
      }
      throw new Error(`Replay dead letter failed for operationId '${operationId}'`);
    }

    const updated = await this.db.get<PowerSyncOutboxRow>(
      `SELECT * FROM notification_dispatch_outbox WHERE id = ? LIMIT 1`,
      [existing.id],
    );
    return mapPowerSyncOutboxToReceipt(updated);
  }

  /**
   * Claim canonical cross-module `notification.requested` rows from the shared outbox_messages table.
   *
   * Backoff semantics are unified with the Prisma shared outbox (OutboxMessage.availableAt):
   * `next_retry_at` is the single availability column. retryable/running rows are only
   * claimable once `next_retry_at <= now`; on claim it is set to the lease deadline so the
   * row is not reclaimable while the lease is live. `lease_expires_at` remains the exclusive
   * fencing deadline. There is NO second `next_available_at`/`available_at` column.
   */
  async claimSharedOutboxIntents(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<Array<import('@memoflow/database').OutboxMessage>> {
    await this.ensureTablesExist();
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseDurationMs = input.leaseDurationMs ?? 30000;
    const limit = input.limit ?? 50;
    const leaseExpiresAtIso = new Date(now.getTime() + leaseDurationMs).toISOString();

    const candidates = await this.db.getAll<PowerSyncSharedOutboxRow>(
      `SELECT * FROM outbox_messages
        WHERE message_type = 'notification.requested'
          AND (lease_expires_at IS NULL OR lease_expires_at < ?)
          AND (
            status = 'pending'
            OR (status = 'retryable' AND (next_retry_at IS NULL OR next_retry_at <= ?))
            OR (status = 'running' AND (next_retry_at IS NULL OR next_retry_at <= ?))
          )
        ORDER BY created_at ASC
        LIMIT ?`,
      [nowIso, nowIso, nowIso, limit],
    );

    const claimed: Array<import('@memoflow/database').OutboxMessage> = [];

    for (const candidate of candidates) {
      const newClaimId = randomUUID();
      const newFencingToken = (candidate.fencing_token || 0) + 1;

      const result = await this.db.execute(
        `UPDATE outbox_messages
            SET status = 'running',
                attempts = attempts + 1,
                dispatched_at = ?,
                next_retry_at = ?,
                owner_token = ?,
                claim_id = ?,
                fencing_token = ?,
                lease_expires_at = ?,
                updated_at = ?
          WHERE id = ?
            AND status = ?
            AND attempts = ?
            AND (lease_expires_at IS NULL OR lease_expires_at < ?)`,
        [
          nowIso,
          leaseExpiresAtIso,
          input.ownerToken,
          newClaimId,
          newFencingToken,
          leaseExpiresAtIso,
          nowIso,
          candidate.id,
          candidate.status,
          candidate.attempts,
          nowIso,
        ],
      );

      if (result.rowsAffected === 1) {
        const updated = await this.db.get<PowerSyncSharedOutboxRow>(
          `SELECT * FROM outbox_messages WHERE id = ? LIMIT 1`,
          [candidate.id],
        );
        claimed.push(mapPowerSyncSharedOutboxToOutboxMessage(updated));
      }
    }

    return claimed;
  }

  /**
   * Update shared outbox_messages status after delivery processing.
   *
   * Conditional write: the row is only transitioned when it is still owned by the
   * caller's lease (`ownerToken` + `claimId` + `fencingToken` match) and still
   * `running`. If the lease was lost or the row was re-claimed by another worker,
   * nothing is overwritten and a `'conflict'` marker is returned. The lease is
   * released on a successful transition.
   *
   * `next_retry_at` carries the backoff deadline (Prisma `availableAt` semantics):
   * retryable rows become claimable again after it; terminal rows get `now`.
   */
  async updateSharedOutboxStatus(
    id: string,
    status: 'succeeded' | 'retryable' | 'dead_letter',
    errorMsg?: string | null,
    nextAvailableAt?: Date | null,
    lease?: { ownerToken: string; claimId: string; fencingToken: number } | null,
  ): Promise<'ok' | 'conflict'> {
    await this.ensureTablesExist();
    if (!lease) {
      return 'conflict';
    }
    const nowIso = new Date().toISOString();
    const availableAtIso = nextAvailableAt ? nextAvailableAt.toISOString() : nowIso;

    const result = await this.db.execute(
      `UPDATE outbox_messages
          SET status = ?,
              last_error = ?,
              next_retry_at = ?,
              dispatched_at = ?,
              owner_token = NULL,
              claim_id = NULL,
              lease_expires_at = NULL,
              updated_at = ?
        WHERE id = ?
          AND status = 'running'
          AND owner_token = ?
          AND claim_id = ?
          AND fencing_token = ?`,
      [
        status,
        errorMsg ?? null,
        availableAtIso,
        status === 'succeeded' ? nowIso : null,
        nowIso,
        id,
        lease.ownerToken,
        lease.claimId,
        lease.fencingToken,
      ],
    );

    return result.rowsAffected === 0 ? 'conflict' : 'ok';
  }

  idempotencyKeyFor(identityId: string, occurrenceKey: string): string {
    return buildIdempotencyKeyString({ identityId, source: 'notification', occurrenceKey });
  }

  async querySucceededOutboxes(
    options?: number | { limit?: number; lastCursor?: string },
  ): Promise<PowerSyncOutboxRow[]> {
    await this.ensureTablesExist();
    const limit = typeof options === 'number' ? options : options?.limit ?? 50;
    const lastCursor = typeof options === 'object' ? options?.lastCursor : undefined;

    const whereClauses = [
      "o.status = 'succeeded'",
      "(c.id IS NULL OR c.response IS NULL OR c.response = '' OR c.status NOT IN ('Delivered', 'Sent'))",
    ];
    const params: unknown[] = [];

    const orderBy = 'ORDER BY o.updated_at ASC, o.id ASC';

    if (lastCursor) {
      const { cursorTs, cursorId, valid } = decodeReceiptCursor(lastCursor);
      if (valid && cursorTs.getTime() >= 0) {
        const cursorIso = cursorTs.toISOString();
        if (cursorId) {
          whereClauses.push('(o.updated_at > ? OR (o.updated_at = ? AND o.id > ?))');
          params.push(cursorIso, cursorIso, cursorId);
        } else if (cursorTs.getTime() > 0) {
          whereClauses.push('o.updated_at > ?');
          params.push(cursorIso);
        }
      }
    }

    params.push(limit);

    const sql = `
      SELECT o.* FROM notification_dispatch_outbox o
      LEFT JOIN notification_channels c ON o.notification_id = c.notification_id AND o.channel = c.channel_type
      WHERE ${whereClauses.join(' AND ')}
      ${orderBy}
      LIMIT ?
    `;
    return this.db.getAll<PowerSyncOutboxRow>(sql, params);
  }

  async saveAck(
    idempotencyKey: string,
    record: import('../../powersync').DesktopTransportAckRecord,
  ): Promise<void> {
    const { PowerSyncDesktopTransportAckStore } = await import('../../powersync');
    const store = new PowerSyncDesktopTransportAckStore(this.db);
    await store.saveAck(idempotencyKey, record);
  }

  async getAck(
    idempotencyKey: string,
  ): Promise<import('../../powersync').DesktopTransportAckRecord | null> {
    const { PowerSyncDesktopTransportAckStore } = await import('../../powersync');
    const store = new PowerSyncDesktopTransportAckStore(this.db);
    return store.getAck(idempotencyKey);
  }
}
