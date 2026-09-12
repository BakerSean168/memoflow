import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import type { IElectronDatabase, IElectronDatabaseQueryResult } from '@memoflow/contracts/electron';
import { GoalTaskBindingQueryInputSchema } from '@memoflow/contracts/reliable-messaging';
import { PowerSyncTaskBindingReadPort } from './powersync-task-binding-read-port';

function createDb(): IElectronDatabase {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'Open',
    goal_id TEXT,
    key_result_id TEXT,
    goal_record_value REAL,
    goal_progress_trigger TEXT,
    created_at INTEGER NOT NULL,
    deleted_at TEXT
  )`);
  return {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const info = sqlite.prepare(sql).run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const row = sqlite.prepare(sql).get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const row = sqlite.prepare(sql).get(...(parameters ?? []));
      if (!row) throw new Error('no rows');
      return row as T;
    },
  };
}

async function seedContext(db: IElectronDatabase): Promise<void> {
  await db.execute(
    `INSERT INTO task_templates
      (id, identity_id, name, status, outcome, goal_id, key_result_id,
       goal_record_value, goal_progress_trigger, created_at, deleted_at)
     VALUES
      ('t1', 'id-A', 'Goal only', 'Active', 'Open', 'goal-1', NULL, NULL, NULL, 1, NULL),
      ('t2', 'id-A', 'KR 1 link', 'Active', 'Open', 'goal-1', 'kr-1', NULL, NULL, 2, NULL),
      ('t3', 'id-A', 'KR 1 contributed', 'Closed', 'Succeeded', 'goal-1', 'kr-1', 2, 'PlanCompletion', 3, NULL),
      ('t4', 'id-A', 'KR 2 paused', 'Paused', 'Open', 'goal-1', 'kr-2', NULL, NULL, 4, NULL),
      ('t5', 'id-A', 'Soft deleted', 'Active', 'Open', 'goal-1', 'kr-1', NULL, NULL, 5, '2026-09-12T00:00:00.000Z'),
      ('t6', 'id-B', 'Foreign identity', 'Active', 'Open', 'goal-1', NULL, NULL, NULL, 6, NULL)`,
  );
}

describe('PowerSyncTaskBindingReadPort', () => {
  it('counts non-deleted Goal bindings with identity isolation, including Goal-only links', async () => {
    const db = createDb();
    await seedContext(db);
    const port = new PowerSyncTaskBindingReadPort(db);

    await expect(
      port.checkActiveTaskBindings({ identityId: 'id-A', goalId: 'goal-1' }),
    ).resolves.toEqual({ hasActiveBindings: true, activeCount: 4 });
    await expect(
      port.checkActiveTaskBindings({ identityId: 'id-B', goalId: 'goal-1' }),
    ).resolves.toEqual({ hasActiveBindings: true, activeCount: 1 });
    await expect(
      port.checkActiveTaskBindings({ identityId: 'id-A', goalId: 'goal-x' }),
    ).resolves.toEqual({ hasActiveBindings: false, activeCount: 0 });

    expect(GoalTaskBindingQueryInputSchema.parse({ identityId: 'i', goalId: 'g' })).toBeTruthy();
    await expect(
      port.checkActiveTaskBindings({ identityId: '', goalId: 'g' } as never),
    ).rejects.toThrow();
  });

  it('lists Goal context with bounded pagination and never leaks another identity', async () => {
    const db = createDb();
    await seedContext(db);
    const port = new PowerSyncTaskBindingReadPort(db);

    const page = await port.listTasksByGoal('id-A', 'goal-1', { limit: 2, offset: 1 });
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 1 });
    expect(page.items.map((item) => item.taskPlanId)).toEqual(['t3', 't2']);
    expect(page.items.some((item) => item.taskPlanId === 't6')).toBe(false);
  });

  it('scopes Key Result queries through the owning Goal', async () => {
    const db = createDb();
    await seedContext(db);
    await db.execute(
      `INSERT INTO task_templates
        (id, identity_id, name, status, outcome, goal_id, key_result_id,
         goal_record_value, goal_progress_trigger, created_at, deleted_at)
       VALUES ('t7', 'id-A', 'Same KR id, other goal', 'Active', 'Open', 'goal-2', 'kr-1', NULL, NULL, 7, NULL)`,
    );
    const port = new PowerSyncTaskBindingReadPort(db);

    const page = await port.listTasksByKeyResult('id-A', 'goal-1', 'kr-1');
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.taskPlanId)).toEqual(['t3', 't2']);
  });

  it('summarizes Goal-level and KR-level Task context without hydrating all Task aggregates', async () => {
    const db = createDb();
    await seedContext(db);
    const port = new PowerSyncTaskBindingReadPort(db);

    await expect(port.getTaskGoalContextSummary('id-A', 'goal-1')).resolves.toEqual({
      total: 4,
      active: 2,
      completed: 1,
      goalLevel: 1,
      byKeyResult: [
        { keyResultId: 'kr-1', total: 2, active: 1 },
        { keyResultId: 'kr-2', total: 1, active: 0 },
      ],
    });
  });
});
