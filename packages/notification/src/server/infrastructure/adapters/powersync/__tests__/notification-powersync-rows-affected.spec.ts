import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { buildIdempotencyKeyString } from '@memoflow/reliable-messaging-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerSyncNotificationRepository } from '../notification-powersync.repository';
import { PowerSyncNotificationReliableAdapter } from '../power-sync-notification-reliable.adapter';
import { PowerSyncDesktopTransportAckStore } from '../../../powersync';

// #709: only real PowerSync views and INSTEAD OF triggers reproduce zero changes().
let db: PowerSyncDatabase;
let dbPath: string;
let repository: PowerSyncNotificationRepository;
let adapter: PowerSyncNotificationReliableAdapter;
const identityId = 'IdentityId_notification-regression';
const now = '2026-10-29T00:00:00.000Z';

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-notification-${randomUUID()}.db`);
  db = new PowerSyncDatabase({ schema: PowerSyncAppSchema, database: { dbFilename: dbPath } });
  await db.waitForReady();
  repository = new PowerSyncNotificationRepository(db);
  adapter = new PowerSyncNotificationReliableAdapter(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function seedNotification(id = 'notification') {
  await db.execute(
    `INSERT INTO notifications (id, identity_id, title, created_at, updated_at)
     VALUES (?, ?, 'Regression', ?, ?)`,
    [id, identityId, now, now],
  );
}
async function seedOutbox(status = 'running') {
  await db.execute(
    `INSERT INTO notification_dispatch_outbox
     (id, identity_id, notification_id, source, occurrence_key, channel, payload_json,
      idempotency_key, status, attempt, fencing_token, owner_token, claim_id,
      lease_expires_at, created_at, updated_at, last_error, dead_letter_at)
     VALUES ('operation', ?, 'notification', 'notification', 'occurrence', 'Desktop', '{}',
      ?, ?, 1, 1, 'owner', 'claim', ?, ?, ?, 'delivery failed', ?)`,
    [
      identityId,
      buildIdempotencyKeyString({
        identityId,
        source: 'notification',
        occurrenceKey: 'occurrence',
      }),
      status,
      new Date(Date.now() + 60000).toISOString(),
      now,
      now,
      status === 'dead_letter' ? now : null,
    ],
  );
}
const heartbeat = () =>
  adapter.heartbeatLease({
    claimId: 'claim',
    ownerToken: 'owner',
    fencingToken: 1,
    notificationId: 'notification',
    occurrenceKey: 'occurrence',
  });
const outbox = () => db.get<Record<string, unknown>>('SELECT * FROM notification_dispatch_outbox');

describe('notification mutations on real PowerSync views', () => {
  it('proves synced and local-only tables are views with zero affected rows', async () => {
    for (const table of [
      'notifications',
      'notification_dispatch_outbox',
      'desktop_delivery_acks',
    ]) {
      await expect(
        db.get('SELECT type FROM sqlite_master WHERE name = ?', [table]),
      ).resolves.toEqual({ type: 'view' });
    }
    await seedNotification();
    const result = await db.execute(
      "UPDATE notifications SET title = 'changed' WHERE id = 'notification'",
    );
    expect(result.rowsAffected).toBe(0);
    await expect(db.get('SELECT title FROM notifications')).resolves.toEqual({ title: 'changed' });
  });
  for (const method of ['archive', 'restore'] as const) {
    const mutate = (owner: string, id: string) =>
      method === 'archive'
        ? repository.archive(owner, id, new Date(now))
        : repository.restore(owner, id);
    it(`${method} accepts an owned notification`, async () => {
      await seedNotification();
      await db.execute("UPDATE notifications SET archived_at = '2026-01-01T00:00:00.000Z'");
      await expect(mutate(identityId, 'notification')).resolves.toBeUndefined();
      await expect(db.get('SELECT archived_at FROM notifications')).resolves.toEqual({
        archived_at: method === 'archive' ? now : null,
      });
    });
    for (const kind of ['missing', 'foreign', 'deleted']) {
      it(`${method} rejects ${kind} notifications with the existing error`, async () => {
        await seedNotification();
        if (kind === 'deleted') await db.execute('UPDATE notifications SET deleted_at = ?', [now]);
        await expect(
          mutate(
            kind === 'foreign' ? 'other' : identityId,
            kind === 'missing' ? 'absent' : 'notification',
          ),
        ).rejects.toThrow('Notification not found for the current identity.');
      });
    }
  }
  for (const method of ['cleanupExpired', 'cleanupDeleted'] as const) {
    it(`${method} returns the real delete count and preserves nonmatching rows`, async () => {
      for (const id of ['one', 'two', 'keep']) await seedNotification(id);
      const column = method === 'cleanupExpired' ? 'expires_at' : 'deleted_at';
      await db.execute(`UPDATE notifications SET ${column} = ? WHERE id != 'keep'`, [now]);
      const deleted = await repository[method](Date.parse(now) + 1);
      await expect(db.getAll('SELECT id FROM notifications')).resolves.toEqual([{ id: 'keep' }]);
      expect(deleted).toBe(2);
      expect(await repository[method](Date.parse(now) + 1)).toBe(0);
    });
  }
  it('claims a pending candidate', async () => {
    await seedOutbox('pending');
    const claimed = await adapter.claimOutboxDispatch({ ownerToken: 'new-owner' });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].lease).toMatchObject({ ownerToken: 'new-owner', fencingToken: 2 });
    expect(await outbox()).toMatchObject({ status: 'running', attempt: 2 });
  });
  for (const change of ["status = 'succeeded'", 'fencing_token = 2']) {
    it(`does not claim a stale candidate after ${change}`, async () => {
      await seedOutbox('pending');
      const getAll = db.getAll.bind(db);
      vi.spyOn(db, 'getAll').mockImplementation(async (sql, params) => {
        const rows = await getAll(sql, params);
        if (sql.includes('ORDER BY created_at ASC')) {
          await db.execute(`UPDATE notification_dispatch_outbox SET ${change}`);
        }
        return rows;
      });
      expect(await adapter.claimOutboxDispatch({ ownerToken: 'new-owner' })).toEqual([]);
      expect(await outbox()).toMatchObject({ owner_token: 'owner', attempt: 1 });
    });
  }
  it('renews a live owned lease', async () => {
    await seedOutbox();
    expect(await heartbeat()).toMatchObject({ renewed: true, lease: { fencingToken: 1 } });
  });
  for (const [change, error] of [
    ['fencing_token = 2', 'Stale fencing token: expected 1, active is 2'],
    ["owner_token = 'other'", "Owner token mismatch: active owner is 'other', incoming is 'owner'"],
  ]) {
    it(`preserves heartbeat fencing error for ${change}`, async () => {
      await seedOutbox();
      await db.execute(`UPDATE notification_dispatch_outbox SET ${change}`);
      await expect(heartbeat()).rejects.toThrow(error);
    });
  }
  it('preserves the missing lease error', async () => {
    await expect(heartbeat()).rejects.toThrow("Dispatch Outbox 'claim' not found.");
  });
  it('does not renew an expired lease', async () => {
    await seedOutbox();
    await db.execute('UPDATE notification_dispatch_outbox SET lease_expires_at = ?', [now]);
    expect(await heartbeat()).toMatchObject({ renewed: false, lease: null });
    expect(await outbox()).toMatchObject({ lease_expires_at: now });
  });
  for (const stale of [false, true]) {
    it(`records delivery with applied:${!stale} for ${stale ? 'stale' : 'matching'} fencing`, async () => {
      await seedOutbox();
      const [receipt] = await adapter.queryReceipts(identityId);
      const result = await adapter.recordDeliveryReceipt(
        {
          ...receipt,
          status: 'succeeded',
          lease: null,
          finishedAt: new Date().toISOString(),
          lastError: null,
        },
        { ownerToken: 'owner', fencingToken: stale ? 0 : 1 },
      );
      expect(result).toMatchObject({ applied: !stale, status: stale ? 'running' : 'succeeded' });
      expect(await outbox()).toMatchObject({ status: stale ? 'running' : 'succeeded' });
    });
  }
  it('returns applied:false when the receipt row disappeared', async () => {
    await seedOutbox();
    const [receipt] = await adapter.queryReceipts(identityId);
    await db.execute('DELETE FROM notification_dispatch_outbox');
    expect(await adapter.recordDeliveryReceipt(receipt)).toMatchObject({ applied: false });
  });
  for (const liveLease of [false, true]) {
    it(`${liveLease ? 'preserves a dead letter with a live lease' : 'replays a dead letter with an expired lease'}`, async () => {
      await seedOutbox('dead_letter');
      if (!liveLease)
        await db.execute('UPDATE notification_dispatch_outbox SET lease_expires_at = NULL');
      const transaction = vi.spyOn(db, 'writeTransaction');
      const result = await adapter.replayDeadLetter({ identityId, operationId: 'operation' });
      expect(transaction).toHaveBeenCalledOnce();
      expect(result.status).toBe(liveLease ? 'dead_letter' : 'retryable');
      expect(await outbox()).toMatchObject({ fencing_token: liveLease ? 1 : 2 });
    });
  }
  it('rejects replay for a foreign identity', async () => {
    await seedOutbox('dead_letter');
    await expect(
      adapter.replayDeadLetter({ identityId: 'other', operationId: 'operation' }),
    ).rejects.toThrow('Dead letter notification outbox not found');
  });
  it('saves and updates a desktop ack, retaining payload when omitted', async () => {
    const store = new PowerSyncDesktopTransportAckStore(db);
    await expect(
      store.saveAck('ack-key', {
        status: 'delivering',
        ackId: 'first',
        timestamp: Date.now(),
        payloadJson: '{"original":true}',
      }),
    ).resolves.toBeUndefined();
    await expect(db.get('SELECT id, status, ack_id FROM desktop_delivery_acks')).resolves.toEqual({
      id: 'ack-key',
      status: 'delivering',
      ack_id: 'first',
    });
    await store.saveAck('ack-key', { status: 'delivered', ackId: 'second', timestamp: Date.now() });
    expect(await new PowerSyncDesktopTransportAckStore(db).getAck('ack-key')).toMatchObject({
      status: 'delivered',
      ackId: 'second',
      payloadJson: '{"original":true}',
    });
    expect(await db.getAll('SELECT id FROM desktop_delivery_acks')).toHaveLength(1);
  });
  it('keeps desktop ack persistence fail-closed when the trigger silently ignores a write', async () => {
    await db.execute(`CREATE TEMP TRIGGER ignore_ack INSTEAD OF INSERT ON desktop_delivery_acks
      BEGIN SELECT RAISE(IGNORE); END`);
    await expect(
      new PowerSyncDesktopTransportAckStore(db).saveAck('ignored', {
        status: 'delivered',
        ackId: 'ack',
        timestamp: Date.now(),
      }),
    ).rejects.toThrow(
      "Failed to save desktop delivery ack for idempotencyKey 'ignored': expected one row affected",
    );
  });
  it('keeps shared outbox_messages as an adapter-owned real table', async () => {
    await adapter.queryReceipts(identityId);
    await expect(
      db.get("SELECT type FROM sqlite_master WHERE name = 'outbox_messages'"),
    ).resolves.toEqual({ type: 'table' });
  });
});
