import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoalVersionConflictError } from '../../../../domain';
import { GoalPowerSyncRepository } from '../goal-powersync.repository';

/**
 * Regression for #707.
 *
 * `goals` is a PowerSync-generated view over `ps_data__goals`; writes are applied
 * by INSTEAD OF triggers, so SQLite reports 0 affected rows for a successful
 * write. These cases must therefore run against the real PowerSync SQLite
 * runtime — a plain table fixture cannot observe the defect.
 */
let db: PowerSyncDatabase;
let dbPath: string;
let identityId: string;
let goalId: string;

beforeEach(async () => {
  identityId = `IdentityId_${randomUUID()}`;
  goalId = `IGoalId_${randomUUID()}`;
  dbPath = path.join(os.tmpdir(), `memoflow-goal-cas-${randomUUID()}.db`);
  db = new PowerSyncDatabase({ schema: PowerSyncAppSchema, database: { dbFilename: dbPath } });
  await db.waitForReady();
  await db.execute(
    `INSERT INTO goals (id, identity_id, name, status, sort_order, version, created_at, updated_at)
     VALUES (?, ?, ?, 'InProgress', 0, 1, ?, ?)`,
    [goalId, identityId, 'Goal CAS', '2026-10-29T00:00:00.000Z', '2026-10-29T00:00:00.000Z'],
  );
});

afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

async function loadGoal(): Promise<NonNullable<Awaited<ReturnType<GoalPowerSyncRepository['findByIdForIdentity']>>>> {
  const repository = new GoalPowerSyncRepository(db);
  const goal = await repository.findByIdForIdentity(identityId, goalId, {
    includeChildren: false,
  });
  if (!goal) throw new Error('seeded goal was not readable');
  return goal;
}

describe('GoalPowerSyncRepository optimistic locking (real PowerSync view)', () => {
  it('updates a goal when the expected version still matches', async () => {
    const repository = new GoalPowerSyncRepository(db);
    const goal = await loadGoal();

    goal.updateBasicInfo({ name: 'Goal CAS renamed', summary: null, description: null });
    goal.advanceVersion();

    await expect(repository.saveRootWithExpectedVersion(goal, 1)).resolves.toBeUndefined();
    await expect(
      db.get<{ name: string; version: number }>('SELECT name, version FROM goals WHERE id = ?', [
        goalId,
      ]),
    ).resolves.toEqual({ name: 'Goal CAS renamed', version: 2 });
  });

  it('increments the stored version on every accepted update', async () => {
    const repository = new GoalPowerSyncRepository(db);

    for (const expectedVersion of [1, 2]) {
      const goal = await loadGoal();
      goal.updateBasicInfo({ name: `Goal CAS v${expectedVersion + 1}`, summary: null, description: null });
      goal.advanceVersion();
      await expect(
        repository.saveRootWithExpectedVersion(goal, expectedVersion),
      ).resolves.toBeUndefined();
    }

    await expect(
      db.get<{ version: number }>('SELECT version FROM goals WHERE id = ?', [goalId]),
    ).resolves.toEqual({ version: 3 });
  });

  it('deletes a goal when the expected version still matches', async () => {
    const repository = new GoalPowerSyncRepository(db);

    await expect(
      repository.deleteWithExpectedVersion(identityId, goalId, 1),
    ).resolves.toBeUndefined();
    await expect(db.getAll('SELECT id FROM goals WHERE id = ?', [goalId])).resolves.toEqual([]);
  });

  it('still rejects an update when another client already changed the version', async () => {
    const repository = new GoalPowerSyncRepository(db);
    const goal = await loadGoal();
    await db.execute('UPDATE goals SET version = 2 WHERE id = ?', [goalId]);

    goal.updateBasicInfo({ name: 'stale write', summary: null, description: null });
    goal.advanceVersion();

    await expect(repository.saveRootWithExpectedVersion(goal, 1)).rejects.toBeInstanceOf(
      GoalVersionConflictError,
    );
    await expect(
      db.get<{ name: string; version: number }>('SELECT name, version FROM goals WHERE id = ?', [
        goalId,
      ]),
    ).resolves.toEqual({ name: 'Goal CAS', version: 2 });
  });

  it('still rejects a delete when another client already changed the version', async () => {
    const repository = new GoalPowerSyncRepository(db);
    await db.execute('UPDATE goals SET version = 2 WHERE id = ?', [goalId]);

    await expect(
      repository.deleteWithExpectedVersion(identityId, goalId, 1),
    ).rejects.toBeInstanceOf(GoalVersionConflictError);
    await expect(db.getAll('SELECT id FROM goals WHERE id = ?', [goalId])).resolves.toEqual([
      { id: goalId },
    ]);
  });

  it('does not treat a foreign identity as a matching goal', async () => {
    const repository = new GoalPowerSyncRepository(db);
    const goal = await loadGoal();
    goal.advanceVersion();

    await expect(
      repository.deleteWithExpectedVersion(`IdentityId_${randomUUID()}`, goalId, 1),
    ).rejects.toBeInstanceOf(GoalVersionConflictError);
    await expect(db.getAll('SELECT id FROM goals WHERE id = ?', [goalId])).resolves.toEqual([
      { id: goalId },
    ]);
  });
});
