import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { LeaseLostError } from '@memoflow/patterns/lease';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PowerSyncScheduleRepository } from '../schedule-powersync.repository';

let db: PowerSyncDatabase;
let dbPath: string;
let repo: PowerSyncScheduleRepository;
const id = 'ScheduleId_regression';
const identityId = 'IdentityId_regression';
const now = '2026-10-29T00:00:00.000Z';

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `memoflow-schedule-cas-${randomUUID()}.db`);
  db = new PowerSyncDatabase({ schema: PowerSyncAppSchema, database: { dbFilename: dbPath } });
  await db.waitForReady();
  repo = new PowerSyncScheduleRepository(db);
  await db.execute(
    `INSERT INTO schedules (id, identity_id, title, range_kind, all_day_start, version, created_at, updated_at)
     VALUES (?, ?, 'Original', 'AllDay', '2026-10-29', 1, ?, ?)`,
    [id, identityId, now, now],
  );
  await repo.createDomainEventOutbox([
    {
      identityId,
      scheduleId: id,
      eventType: 'regression',
      payload: '{}',
      idempotencyKey: 'regression',
    },
  ]);
});

afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function entry() {
  const result = await repo.findByIdForIdentity(identityId, id);
  if (!result) throw new Error('seeded schedule missing');
  return result;
}

async function claimed() {
  const items = await repo.claimDomainEventOutboxItems('owner');
  expect(items).toHaveLength(1);
  return items[0].id;
}

describe('schedule CAS on real PowerSync views (#709)', () => {
  it('proves view writes change stored state while reporting zero rows', async () => {
    await expect(
      db.getAll(
        `SELECT name, type FROM sqlite_master WHERE name IN ('schedules', 'schedule_domain_event_outbox', 'schedule_rebuild_outbox') ORDER BY name`,
      ),
    ).resolves.toEqual([
      { name: 'schedule_domain_event_outbox', type: 'view' },
      { name: 'schedule_rebuild_outbox', type: 'table' },
      { name: 'schedules', type: 'view' },
    ]);
    const update = await db.execute('UPDATE schedules SET title = ? WHERE id = ?', ['Written', id]);
    expect(update.rowsAffected).toBe(0);
    await expect(db.get('SELECT title FROM schedules WHERE id = ?', [id])).resolves.toEqual({
      title: 'Written',
    });
    const eventId = await claimed();
    const eventUpdate = await db.execute(
      `UPDATE schedule_domain_event_outbox SET status = 'completed' WHERE id = ?`,
      [eventId],
    );
    expect(eventUpdate.rowsAffected).toBe(0);
    await expect(
      db.get('SELECT status FROM schedule_domain_event_outbox WHERE id = ?', [eventId]),
    ).resolves.toEqual({ status: 'completed' });
    const deletion = await db.execute('DELETE FROM schedules WHERE id = ?', [id]);
    expect(deletion.rowsAffected).toBe(0);
    await expect(db.getOptional('SELECT id FROM schedules WHERE id = ?', [id])).resolves.toBeNull();
  });

  for (const ownerTransaction of [false, true]) {
    it(`accepts a matching update (owner transaction: ${ownerTransaction})`, async () => {
      const schedule = await entry();
      schedule.updateTitle('Updated');
      const write = ownerTransaction
        ? repo.withTransaction((tx) => tx.save(schedule, 1))
        : repo.save(schedule, 1);
      await expect(write).resolves.toBeUndefined();
      await expect(
        db.get('SELECT title, version FROM schedules WHERE id = ?', [id]),
      ).resolves.toEqual({ title: 'Updated', version: 2 });
    });
    it(`accepts a matching delete (owner transaction: ${ownerTransaction})`, async () => {
      const write = ownerTransaction
        ? repo.withTransaction((tx) => tx.deleteById(identityId, id, 1))
        : repo.deleteById(identityId, id, 1);
      await expect(write).resolves.toBeUndefined();
      await expect(
        db.getOptional('SELECT id FROM schedules WHERE id = ?', [id]),
      ).resolves.toBeNull();
    });
  }

  for (const operation of ['update', 'delete'] as const) {
    it(`preserves CONFLICT and context for a stale ${operation}`, async () => {
      const schedule = await entry();
      await db.execute('UPDATE schedules SET version = 3 WHERE id = ?', [id]);
      const write =
        operation === 'update' ? repo.save(schedule, 1) : repo.deleteById(identityId, id, 1);
      await expect(write).rejects.toMatchObject({
        code: 'CONFLICT',
        message: `Schedule event ${id} version conflict (expected 1, current version is 3)`,
        context: { currentVersion: 3, expectedVersion: 1 },
        statusCode: 409,
      });
      await expect(
        db.get('SELECT title, version FROM schedules WHERE id = ?', [id]),
      ).resolves.toEqual({ title: 'Original', version: 3 });
    });
    it(`preserves NOT_FOUND for a foreign identity ${operation}`, async () => {
      const schedule = await entry();
      const foreignRepo = new PowerSyncScheduleRepository(db);
      // Load the same id under another identity to exercise the update ownership predicate.
      const foreign = schedule;
      if (operation === 'update') {
        await db.execute('UPDATE schedules SET identity_id = ? WHERE id = ?', ['foreign', id]);
      }
      await expect(
        operation === 'update' ? foreignRepo.save(foreign, 1) : repo.deleteById('foreign', id, 1),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message:
          operation === 'update'
            ? `Schedule event ${id} not found`
            : `Schedule event ${id} not found for identity`,
        statusCode: 404,
      });
      expect(await db.getAll('SELECT id FROM schedules WHERE id = ?', [id])).toEqual([{ id }]);
    });
  }

  it('preserves NOT_FOUND for a missing delete', async () => {
    await db.execute('DELETE FROM schedules WHERE id = ?', [id]);
    await expect(repo.deleteById(identityId, id, 1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('claims a pending view row and excludes a live lease using stored token/status', async () => {
    const eventId = await claimed();
    await expect(repo.claimDomainEventOutboxItems('other')).resolves.toEqual([]);
    await expect(
      db.get('SELECT status, claim_token FROM schedule_domain_event_outbox WHERE id = ?', [
        eventId,
      ]),
    ).resolves.toEqual({ status: 'processing', claim_token: 'owner' });
  });

  for (const [status, error, maxAttempts] of [
    ['completed', undefined, 5],
    ['failed', 'failure', 1],
    ['retry', 'failure', 5],
  ] as const) {
    it(`accepts owned domain outbox ${status}`, async () => {
      const eventId = await claimed();
      await expect(
        repo.markDomainEventOutboxProcessed(eventId, 'owner', error, maxAttempts),
      ).resolves.toBeUndefined();
      const row = await db.get<Record<string, unknown>>(
        'SELECT * FROM schedule_domain_event_outbox WHERE id = ?',
        [eventId],
      );
      expect(row).toMatchObject({
        status,
        claim_token: null,
        attempts: error ? 1 : 0,
        last_error: error ?? null,
      });
      if (status === 'completed') expect(row.published_at).toBeTruthy();
      if (status === 'retry') expect(row.next_attempt_at).toBeTruthy();
    });
    for (const lost of ['token', 'status', 'missing']) {
      it(`rejects ${status} after lease ${lost} loss`, async () => {
        const eventId = await claimed();
        if (lost === 'token')
          await db.execute('UPDATE schedule_domain_event_outbox SET claim_token = ? WHERE id = ?', [
            'other',
            eventId,
          ]);
        if (lost === 'status')
          await db.execute(
            `UPDATE schedule_domain_event_outbox SET status = 'completed' WHERE id = ?`,
            [eventId],
          );
        if (lost === 'missing')
          await db.execute('DELETE FROM schedule_domain_event_outbox WHERE id = ?', [eventId]);
        const before = await db.getOptional(
          'SELECT * FROM schedule_domain_event_outbox WHERE id = ?',
          [eventId],
        );
        await expect(
          repo.markDomainEventOutboxProcessed(eventId, 'owner', error, maxAttempts),
        ).rejects.toBeInstanceOf(LeaseLostError);
        await expect(
          repo.markDomainEventOutboxProcessed(eventId, 'owner', error, maxAttempts),
        ).rejects.toThrow(
          `Domain event outbox item ${eventId} is no longer owned by this claim token (lease lost)`,
        );
        await expect(
          db.getOptional('SELECT * FROM schedule_domain_event_outbox WHERE id = ?', [eventId]),
        ).resolves.toEqual(before);
      });
    }
  }

  for (const [status, error, maxAttempts] of [
    ['completed', undefined, 5],
    ['failed', 'failure', 1],
    ['retry', 'failure', 5],
  ] as const) {
    it(`locks down unaffected real-table rebuild ${status}`, async () => {
      await repo.createRebuildOutbox({
        identityId,
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        sourceRevision: 1,
      });
      const [item] = await repo.claimRebuildOutboxItems('owner');
      await expect(
        repo.markRebuildOutboxProcessed(item.id, 'owner', error, maxAttempts),
      ).resolves.toBeUndefined();
      await expect(
        db.get('SELECT status FROM schedule_rebuild_outbox WHERE id = ?', [item.id]),
      ).resolves.toEqual({ status });
    });
  }
});
