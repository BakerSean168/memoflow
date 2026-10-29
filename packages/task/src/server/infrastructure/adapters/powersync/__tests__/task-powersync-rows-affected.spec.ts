import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerSyncTaskOccurrenceRepository } from '../task-occurrence-powersync.repository';
import { PowerSyncTaskGoalOutboxDispatchStore } from '../powersync-task-goal-outbox-dispatch-store';
import { PowerSyncTaskWriteTransactionRunner } from '../powersync-task-write-transaction-runner';
import { OptimisticConcurrencyError } from '../../../../domain/errors/optimistic-concurrency.error';

// #709: real PowerSync views/INSTEAD OF triggers are required to reproduce zero changes().
let db: PowerSyncDatabase;
let dbPath: string;
const identityId = 'IdentityId_task-regression';
const occurrenceId = 'TaskOccurrenceId_regression';
const now = '2026-10-29T00:00:00.000Z';
const future = '2026-10-29T00:01:00.000Z';

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-task-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function seedOccurrence(id = occurrenceId) {
  await db.execute(
    `INSERT INTO task_occurrences
     (id, plan_id, identity_id, occurrence_key, schedule_date, schedule_timing,
      importance_snapshot, status, checklist_state, version, created_at, updated_at)
     VALUES (?, 'TaskPlanId_regression', ?, 'regression:2026-10-29', '2026-10-29',
      '{"kind":"AllDay"}', 'Moderate', 'Pending', '[]', 1, ?, ?)`,
    [id, identityId, now, now],
  );
}
async function loadOccurrence() {
  const occurrence = await new PowerSyncTaskOccurrenceRepository(db).findByIdForIdentity(
    identityId,
    occurrenceId,
  );
  if (!occurrence) throw new Error('seeded occurrence was not readable');
  return occurrence;
}
async function seedOutbox(status = 'PENDING', availableAt = now) {
  await db.execute(
    `INSERT INTO task_goal_outbox
     (id, identity_id, payload, status, attempts, available_at, last_error, dispatched_at,
      created_at, updated_at)
     VALUES ('event', ?, '{}', ?, 3, ?, 'failed', ?, ?, ?)`,
    [identityId, status, availableAt, now, now, now],
  );
}
const store = () => new PowerSyncTaskGoalOutboxDispatchStore(db, { now: () => new Date(now) });
const outbox = () => db.get<Record<string, unknown>>('SELECT * FROM task_goal_outbox');

describe('task mutations on real PowerSync views', () => {
  it('proves both target tables are views whose successful updates report zero rows', async () => {
    await seedOccurrence();
    await seedOutbox();
    for (const table of ['task_occurrences', 'task_goal_outbox']) {
      expect(await db.get('SELECT type FROM sqlite_master WHERE name = ?', [table])).toEqual({
        type: 'view',
      });
      const result = await db.execute(`UPDATE ${table} SET updated_at = ?`, [future]);
      expect(result.rowsAffected).toBe(0);
      expect(await db.get(`SELECT updated_at FROM ${table}`)).toEqual({
        updated_at: future,
      });
    }
  });

  for (const transactionBound of [false, true]) {
    it(`updates a matching occurrence (${transactionBound ? 'owner transaction' : 'standalone'})`, async () => {
      await seedOccurrence();
      const occurrence = await loadOccurrence();
      occurrence.start(Date.parse(now));
      const save = transactionBound
        ? new PowerSyncTaskWriteTransactionRunner(db).run(({ occurrenceRepository }) =>
            occurrenceRepository.save(occurrence),
          )
        : new PowerSyncTaskOccurrenceRepository(db).save(occurrence);
      await expect(save).resolves.toBeUndefined();
      expect(await db.get('SELECT status, version FROM task_occurrences')).toEqual({
        status: 'InProgress',
        version: 2,
      });
    });
  }

  for (const change of ['version', 'identity']) {
    it(`preserves the occurrence conflict error after ${change} changes`, async () => {
      await seedOccurrence();
      const occurrence = await loadOccurrence();
      occurrence.start(Date.parse(now));
      await db.execute(
        change === 'version'
          ? 'UPDATE task_occurrences SET version = 3'
          : "UPDATE task_occurrences SET identity_id = 'other'",
      );
      const error = new OptimisticConcurrencyError(
        'TaskOccurrence',
        occurrenceId,
        1,
        change === 'version' ? 3 : 1,
      );
      await expect(new PowerSyncTaskOccurrenceRepository(db).save(occurrence)).rejects.toThrow(
        error,
      );
      expect(await db.get('SELECT status, version, identity_id FROM task_occurrences')).toEqual({
        status: 'Pending',
        version: change === 'version' ? 3 : 1,
        identity_id: change === 'version' ? identityId : 'other',
      });
    });
  }

  it('preserves insert-on-missing and duplicate occurrence-key fallback', async () => {
    await seedOccurrence();
    const occurrence = await loadOccurrence();
    await db.execute('DELETE FROM task_occurrences');
    const repository = new PowerSyncTaskOccurrenceRepository(db);
    await expect(repository.save(occurrence)).resolves.toBeUndefined();
    expect(await db.getAll('SELECT id FROM task_occurrences')).toEqual([{ id: occurrenceId }]);
    await db.execute('DELETE FROM task_occurrences');
    await seedOccurrence('other-occurrence');
    await expect(repository.save(occurrence)).resolves.toBeUndefined();
    expect(await db.getAll('SELECT id FROM task_occurrences')).toEqual([
      { id: 'other-occurrence' },
    ]);
  });

  for (const status of ['PENDING', 'PROCESSING']) {
    it(`claims due ${status}, preserves payload and excludes the live lease`, async () => {
      await seedOutbox(status);
      await expect(store().claimPending(10)).resolves.toEqual([
        { eventId: 'event', payload: '{}' },
      ]);
      expect(await outbox()).toMatchObject({
        status: 'PROCESSING',
        available_at: future,
        attempts: 3,
      });
      await expect(store().claimPending(10)).resolves.toEqual([]);
    });
  }

  for (const change of [
    "status = 'DELIVERED'",
    "available_at = '2026-10-29T00:01:00.000Z'",
    'deleted',
  ]) {
    it(`rejects a stale claim candidate after ${change}`, async () => {
      await seedOutbox();
      const writeTransaction = db.writeTransaction.bind(db);
      vi.spyOn(db, 'writeTransaction').mockImplementation((callback) =>
        writeTransaction(async (tx) => {
          const getAll = tx.getAll.bind(tx);
          vi.spyOn(tx, 'getAll').mockImplementation(async (sql, parameters) => {
            const rows = await getAll(sql, parameters);
            if (sql.includes('ORDER BY available_at')) {
              await tx.execute(
                change === 'deleted'
                  ? 'DELETE FROM task_goal_outbox'
                  : `UPDATE task_goal_outbox SET ${change}`,
              );
            }
            return rows;
          });
          return callback(tx);
        }),
      );
      await expect(store().claimPending(10)).resolves.toEqual([]);
      const rows = await db.getAll<Record<string, unknown>>('SELECT * FROM task_goal_outbox');
      if (change === 'deleted') expect(rows).toEqual([]);
      else
        expect(rows[0]).toMatchObject({
          status: change.startsWith('status') ? 'DELIVERED' : 'PENDING',
          available_at: change.startsWith('available_at') ? future : now,
        });
    });
  }

  for (const status of ['DELIVERED', 'DEAD_LETTER']) {
    it(`does not claim ${status} events`, async () => {
      await seedOutbox(status);
      await expect(store().claimPending(10)).resolves.toEqual([]);
      expect(await outbox()).toMatchObject({ status, available_at: now });
    });
  }
  it('does not claim missing events or future pending events', async () => {
    await expect(store().claimPending(10)).resolves.toEqual([]);
    await seedOutbox('PENDING', future);
    await expect(store().claimPending(10)).resolves.toEqual([]);
    expect(await outbox()).toMatchObject({
      status: 'PENDING',
      available_at: future,
    });
  });

  it('replays a dead letter and reports success', async () => {
    await seedOutbox('DEAD_LETTER');
    await expect(store().replayDeadLetter('event')).resolves.toBe(true);
    expect(await outbox()).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      available_at: now,
      last_error: null,
      dispatched_at: null,
    });
    await expect(store().replayDeadLetter('event')).resolves.toBe(false);
  });
  for (const status of ['PENDING', 'PROCESSING', 'DELIVERED']) {
    it(`rejects replay of ${status} without modifying it`, async () => {
      await seedOutbox(status);
      await expect(store().replayDeadLetter('event')).resolves.toBe(false);
      expect(await outbox()).toMatchObject({
        status,
        attempts: 3,
        last_error: 'failed',
      });
    });
  }
  it('returns false when replaying a missing event', async () => {
    await expect(store().replayDeadLetter('missing')).resolves.toBe(false);
  });
});
