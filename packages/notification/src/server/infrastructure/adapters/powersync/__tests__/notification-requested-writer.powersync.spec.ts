import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { IElectronDatabase, IElectronDatabaseQueryResult } from '@memoflow/desktop-contracts';
import { buildIdempotencyKeyString } from '@memoflow/reliable-messaging-contracts';
import {
  NotificationRequestedSchema,
  NOTIFICATION_REQUESTED_MESSAGE_TYPE,
  type NotificationRequested,
} from '@memoflow/notification-contracts';
import { NotificationRequestedPowerSyncWriterAdapter } from '../notification-requested-writer.powersync.adapter';
import { PowerSyncNotificationReliableAdapter } from '../power-sync-notification-reliable.adapter';

function wrapSqlite(sqlite: ReturnType<typeof Database>): IElectronDatabase {
  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row as T;
    },
    async writeTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return wrapper;
}

describe('NotificationRequestedPowerSyncWriterAdapter (NOTIF-3301 desktop lane)', () => {
  let db: IElectronDatabase;
  let sqlite: ReturnType<typeof Database>;
  let writer: NotificationRequestedPowerSyncWriterAdapter;
  let identityId: string;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = wrapSqlite(sqlite);
    writer = new NotificationRequestedPowerSyncWriterAdapter(db);
    identityId = `identity_${randomUUID()}`;
  });

  function buildEnvelope(overrides: Partial<NotificationRequested> = {}): NotificationRequested {
    const occurrenceKey = `reminder:${randomUUID()}`;
    return NotificationRequestedSchema.parse({
      identityId,
      occurrenceKey,
      idempotencyKey: buildIdempotencyKeyString({
        identityId,
        source: 'notification',
        occurrenceKey,
      }),
      workflowKey: 'task.reminder',
      topic: 'task.reminder',
      content: { title: '任务提醒', content: '提醒已到达。' },
      ...overrides,
    });
  }

  function tableExists(name: string): boolean {
    return (
      sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(name) !== undefined
    );
  }

  function rows(idempotencyKey?: string): Record<string, unknown>[] {
    if (idempotencyKey) {
      return sqlite
        .prepare(`SELECT * FROM outbox_messages WHERE idempotency_key = ?`)
        .all(idempotencyKey) as Record<string, unknown>[];
    }
    return sqlite.prepare(`SELECT * FROM outbox_messages`).all() as Record<string, unknown>[];
  }

  it('1. Writes the notification.requested envelope durably into the shared outbox (auto-creating the table)', async () => {
    expect(tableExists('outbox_messages')).toBe(false);

    const opId = randomUUID();
    const envelope = buildEnvelope();
    const receipt = await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    expect(receipt.status).toBe('pending');
    expect(receipt.operationId).toBe(opId);
    expect(receipt.idempotencyKey).toBe(envelope.idempotencyKey);
    expect(receipt.source).toBe('notification');
    expect(receipt.occurrenceKey).toBe(envelope.occurrenceKey);

    const shared = rows(envelope.idempotencyKey);
    expect(shared).toHaveLength(1);
    expect(shared[0].message_type).toBe(NOTIFICATION_REQUESTED_MESSAGE_TYPE);
    expect(shared[0].status).toBe('pending');
    expect(shared[0].identity_id).toBe(identityId);
    expect(shared[0].schema_version).toBe(1);
    expect(JSON.parse(String(shared[0].payload_json))).toMatchObject({
      identityId,
      occurrenceKey: envelope.occurrenceKey,
      idempotencyKey: envelope.idempotencyKey,
    });
  });

  it('2. Writer enqueue is idempotent by operationId (re-enqueue returns the existing receipt, one durable row)', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();

    const first = await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const second = await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    expect(second.operationId).toBe(first.operationId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.status).toBe('pending');
    expect(rows()).toHaveLength(1);
  });

  it('3. Envelope-level idempotency: a retry with a NEW operationId reconciles to the durable row pinned by idempotencyKey', async () => {
    const originalOpId = randomUUID();
    const retryOpId = randomUUID();
    const envelope = buildEnvelope();

    const first = await writer.enqueueNotificationRequested({
      operationId: originalOpId,
      envelope,
    });
    const retried = await writer.enqueueNotificationRequested({ operationId: retryOpId, envelope });

    expect(retried.operationId).toBe(first.operationId);
    expect(retried.idempotencyKey).toBe(envelope.idempotencyKey);
    expect(retried.status).toBe('pending');
    expect(rows()).toHaveLength(1);
    expect(rows().find((r) => r.id === retryOpId)).toBeUndefined();
  });

  it('4. Writer-level correlation/causation fallbacks persist on the durable row', async () => {
    const envelopeCorrelationId = `corr-${randomUUID()}`;
    const envelopeCausationId = `cause-${randomUUID()}`;
    const opId = randomUUID();
    const envelope = buildEnvelope({
      correlationId: envelopeCorrelationId,
      causationId: envelopeCausationId,
    });
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    let shared = rows(envelope.idempotencyKey);
    expect(shared[0].correlation_id).toBe(envelopeCorrelationId);
    expect(shared[0].causation_id).toBe(envelopeCausationId);

    // Input-level fallback when the envelope omits both; operationId is the last
    // resort for the correlation chain.
    const inputCorrelationId = `input-corr-${randomUUID()}`;
    const inputCausationId = `input-cause-${randomUUID()}`;
    const opId2 = randomUUID();
    const envelope2 = buildEnvelope();
    await writer.enqueueNotificationRequested({
      operationId: opId2,
      envelope: envelope2,
      correlationId: inputCorrelationId,
      causationId: inputCausationId,
    });

    shared = rows(envelope2.idempotencyKey);
    expect(shared[0].correlation_id).toBe(inputCorrelationId);
    expect(shared[0].causation_id).toBe(inputCausationId);

    const opId3 = randomUUID();
    const envelope3 = buildEnvelope();
    await writer.enqueueNotificationRequested({ operationId: opId3, envelope: envelope3 });
    shared = rows(envelope3.idempotencyKey);
    expect(shared[0].correlation_id).toBe(opId3);
  });

  it('5. The durable row is claimable by the desktop reliable adapter after enqueue', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    const row = await db.getOptional<{ status: string; idempotency_key: string }>(
      `SELECT status, idempotency_key FROM outbox_messages WHERE id = ?`,
      [opId],
    );
    expect(row?.status).toBe('pending');
    expect(row?.idempotency_key).toBe(envelope.idempotencyKey);

    // Claim through the actual desktop reliable adapter, proving the dedicated
    // writer and the shared-outbox consumer agree on the durable row shape.
    const reliableAdapter = new PowerSyncNotificationReliableAdapter(db);
    const claimed = await reliableAdapter.claimSharedOutboxIntents({
      ownerToken: 'worker-test',
      limit: 50,
    });
    const claimedRow = claimed.find((candidate) => candidate.id === opId);
    expect(claimedRow).toMatchObject({
      id: opId,
      messageType: NOTIFICATION_REQUESTED_MESSAGE_TYPE,
      status: 'running',
      ownerToken: 'worker-test',
    });
    expect(claimedRow?.claimId).toBeTruthy();
    expect(claimedRow?.leaseExpiresAt).toBeTruthy();
  });

  it('6. UNIQUE idempotency_key makes business idempotency durable under concurrent writers', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();

    // Winner writes first under its own operationId.
    const winner = new NotificationRequestedPowerSyncWriterAdapter(db);
    const winnerReceipt = await winner.enqueueNotificationRequested({
      operationId: opId,
      envelope,
    });

    // A second adapter racing with a fresh operationId for the SAME canonical
    // envelope must reconcile onto the winner's durable row instead of creating
    // a duplicate NotificationRequested.
    const contender = new NotificationRequestedPowerSyncWriterAdapter(db);
    const contended = await contender.enqueueNotificationRequested({
      operationId: randomUUID(),
      envelope,
    });
    expect(contended.operationId).toBe(winnerReceipt.operationId);
    expect(contended.idempotencyKey).toBe(envelope.idempotencyKey);
    expect(rows()).toHaveLength(1);

    // The durable UNIQUE constraint is actually enforced (not a best-effort
    // check-then-insert): a direct concurrent-style duplicate insert under a
    // fresh id is rejected by SQLite.
    const nowIso = new Date().toISOString();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO outbox_messages (
            id, aggregate_type, aggregate_id, message_type, payload_json,
            status, attempts, identity_id, idempotency_key, created_at, updated_at
          ) VALUES (?, 'shared', 'shared', ?, ?, 'pending', 0, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          NOTIFICATION_REQUESTED_MESSAGE_TYPE,
          JSON.stringify(envelope),
          envelope.identityId,
          envelope.idempotencyKey,
          nowIso,
          nowIso,
        ),
    ).toThrow(/UNIQUE constraint failed/);
    expect(rows()).toHaveLength(1);
  });

  it('7. Rejects an envelope whose canonical idempotency key does not match its identity tuple', async () => {
    const valid = buildEnvelope();
    const invalidEnvelope = {
      ...valid,
      idempotencyKey: buildIdempotencyKeyString({
        identityId: valid.identityId,
        source: 'notification',
        occurrenceKey: `${valid.occurrenceKey}:different`,
      }),
    } as NotificationRequested;

    await expect(
      writer.enqueueNotificationRequested({
        operationId: randomUUID(),
        envelope: invalidEnvelope,
      }),
    ).rejects.toThrow();
    expect(tableExists('outbox_messages')).toBe(false);
  });

  it('8. Participates in caller-owned PowerSync transactions and recovers cleanly after rollback', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();

    await expect(
      db.writeTransaction(async (tx) => {
        await writer.enqueueNotificationRequested(
          { operationId: opId, envelope },
          { txClient: tx },
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    // DDL + row are both rolled back, and the adapter must not have cached a
    // false "table initialized" result from the aborted transaction.
    expect(tableExists('outbox_messages')).toBe(false);

    await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    expect(tableExists('outbox_messages')).toBe(true);
    expect(rows(envelope.idempotencyKey)).toHaveLength(1);
  });
});
