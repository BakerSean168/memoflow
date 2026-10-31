/**
 * NotificationRequestedPowerSyncWriterAdapter - PowerSync / SQLite implementation
 * of the notification-requested writer port (NOTIF-3301 durable envelope).
 *
 * Desktop lane counterpart of NotificationRequestedPrismaWriterAdapter: business
 * handlers enqueue a `NotificationRequested` envelope into the SHARED
 * `outbox_messages` table that the desktop durable runtime claims via
 * `claimSharedOutboxIntents` and materializes into the Notification Fact +
 * per-channel delivery plan. The write never reaches into any channel
 * deliverer, so a handler commit never depends on external Desktop/Email/Push
 * delivery success.
 *
 * Idempotency semantics mirror the Prisma writer exactly: the durable dedupe
 * anchor is the canonical `idempotencyKey` (not the operationId), so a
 * crash/replay retry carrying the same envelope collapses onto the existing row.
 */

import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import {
  type NotificationRequestedOutboxInput,
  NotificationRequestedOutboxInputSchema,
  type NotificationRequestedWriterPort,
  NOTIFICATION_REQUESTED_MESSAGE_TYPE,
} from '@memoflow/notification-contracts';
import {
  assertValidBusinessOperationReceipt,
  parseIdempotencyKeyString,
  type BusinessOperationReceipt,
} from '@memoflow/reliable-messaging-contracts';
import { type PowerSyncSharedOutboxRow } from './power-sync-notification-reliable.adapter';

export class NotificationRequestedPowerSyncWriterAdapter implements NotificationRequestedWriterPort {
  private tableInitialized = false;

  constructor(private readonly db: IElectronDatabase) {}

  private async ensureTablesExist(
    client: IElectronDatabaseTransaction = this.db,
    cacheResult = client === this.db,
  ): Promise<void> {
    if (cacheResult && this.tableInitialized) return;
    await client.execute(`
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
        last_heartbeat_at TEXT,
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
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_om_message_type ON outbox_messages(message_type);`,
    );
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_om_status ON outbox_messages(status);`);
    if (cacheResult) this.tableInitialized = true;
  }

  private async fetchById(
    client: IElectronDatabaseTransaction,
    id: string,
  ): Promise<PowerSyncSharedOutboxRow | null> {
    return client.getOptional<PowerSyncSharedOutboxRow>(
      `SELECT * FROM outbox_messages WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  private async fetchByIdempotencyKey(
    client: IElectronDatabaseTransaction,
    idempotencyKey: string,
  ): Promise<PowerSyncSharedOutboxRow | null> {
    return client.getOptional<PowerSyncSharedOutboxRow>(
      `SELECT * FROM outbox_messages WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey],
    );
  }

  private mapToReceipt(row: PowerSyncSharedOutboxRow): BusinessOperationReceipt {
    // SQLite's worker stores W0 statuses directly (succeeded/running/retryable),
    // unlike Prisma's legacy dispatched/failed/dead shared-outbox vocabulary.
    const key = parseIdempotencyKeyString(row.idempotency_key ?? '');
    const status = row.status;
    const terminal = ['succeeded', 'skipped', 'failed', 'cancelled'].includes(status);
    return assertValidBusinessOperationReceipt({
      schemaVersion: 1,
      operationId: row.id,
      identityId: row.identity_id ?? key?.identityId,
      source: key?.source ?? 'notification',
      occurrenceKey: key?.occurrenceKey ?? row.id,
      idempotencyKey: row.idempotency_key,
      status,
      attempt: Number(row.attempts ?? 0),
      lease:
        status === 'running' && row.owner_token && row.claim_id && row.lease_expires_at
          ? {
              schemaVersion: 1,
              resourceKey: `${key?.source ?? 'notification'}:${row.identity_id}:${key?.occurrenceKey ?? row.id}`,
              ownerToken: row.owner_token,
              claimId: row.claim_id,
              fencingToken: Number(row.fencing_token ?? 0),
              expiresAt: new Date(row.lease_expires_at).toISOString(),
              lastHeartbeatAt: row.last_heartbeat_at
                ? new Date(row.last_heartbeat_at).toISOString()
                : null,
              heartbeatIntervalMs: null,
            }
          : null,
      lastError: ['succeeded', 'skipped'].includes(status) ? null : (row.last_error ?? null),
      nextRetryAt:
        status === 'retryable' && row.next_retry_at
          ? new Date(row.next_retry_at).toISOString()
          : null,
      deadLetterAt: status === 'dead_letter' ? new Date(row.updated_at).toISOString() : null,
      correlationId: row.correlation_id ?? null,
      causationId: row.causation_id ?? null,
      attemptsHistory: [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      finishedAt: terminal ? new Date(row.dispatched_at ?? row.updated_at).toISOString() : null,
    });
  }

  async enqueueNotificationRequested(
    input: NotificationRequestedOutboxInput,
    options?: { txClient?: unknown },
  ): Promise<BusinessOperationReceipt> {
    const validated = NotificationRequestedOutboxInputSchema.parse(input);
    const txClient = options?.txClient;
    if (
      txClient !== undefined &&
      (typeof txClient !== 'object' ||
        txClient === null ||
        !('execute' in txClient) ||
        !('getOptional' in txClient))
    ) {
      throw new TypeError(
        'NotificationRequested PowerSync txClient must be an Electron transaction.',
      );
    }
    const client = (txClient as IElectronDatabaseTransaction | undefined) ?? this.db;
    // When the schema is prepared inside a caller-owned transaction, do not cache
    // the result: that transaction may still roll back. A later retry must be
    // able to recreate the table/indexes safely.
    await this.ensureTablesExist(client, txClient === undefined);

    // Deterministic operationId anchor: a full replay of the same handler
    // execution must resolve to the durable row it created before.
    const existingById = await this.fetchById(client, validated.operationId);
    if (existingById) {
      return this.mapToReceipt(existingById);
    }

    // Envelope-level idempotency: the canonical idempotencyKey (NOT the
    // operationId) is the durable dedupe anchor.
    const existingByIdempotencyKey = await this.fetchByIdempotencyKey(
      client,
      validated.envelope.idempotencyKey,
    );
    if (existingByIdempotencyKey) {
      return this.mapToReceipt(existingByIdempotencyKey);
    }

    const now = new Date().toISOString();
    const envelope = validated.envelope;
    const correlationId =
      envelope.correlationId ?? validated.correlationId ?? validated.operationId;
    const causationId = envelope.causationId ?? validated.causationId ?? null;

    try {
      await client.execute(
        `INSERT INTO outbox_messages (
          id, aggregate_type, aggregate_id, message_type, payload_json,
          status, attempts, identity_id, idempotency_key, created_at,
          updated_at, correlation_id, causation_id, schema_version
        ) VALUES (?, 'shared', 'shared', ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, 1)`,
        [
          validated.operationId,
          NOTIFICATION_REQUESTED_MESSAGE_TYPE,
          JSON.stringify(envelope),
          envelope.identityId,
          envelope.idempotencyKey,
          now,
          now,
          correlationId,
          causationId,
        ],
      );

      const created = await this.fetchById(client, validated.operationId);
      if (!created) {
        throw new Error(
          `[FAIL-FAST] Shared outbox row '${validated.operationId}' was not readable after INSERT.`,
        );
      }
      return this.mapToReceipt(created);
    } catch (cause) {
      // An idempotency-key collision means a concurrent winner created the
      // durable row first under either anchor; reconcile to the stable row.
      const reFetched =
        (await this.fetchById(client, validated.operationId)) ??
        (await this.fetchByIdempotencyKey(client, validated.envelope.idempotencyKey));
      if (!reFetched) throw cause;
      return this.mapToReceipt(reFetched);
    }
  }
}
