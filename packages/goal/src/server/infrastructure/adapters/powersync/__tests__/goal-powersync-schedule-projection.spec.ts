import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { GoalPowerSyncRepository } from '../goal-powersync.repository';
import { createGoalScheduleProjectionSource } from '../../../schedule-projection-source';
import { createTimeContext } from '@memoflow/time';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

function createTestSqliteDatabase(): IElectronDatabase {
  const sqlite = new Database(':memory:');
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
    async writeTransaction<T>(
      callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
    ): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper as IElectronDatabaseTransaction);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => sqlite.close(),
  } as IElectronDatabase & { close(): void };
  return wrapper;
}

const GOALS_SQL = `CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  feasibility_analysis TEXT,
  motivation TEXT,
  status TEXT NOT NULL,
  start_date TEXT,
  due_date TEXT,
  completed_at TEXT,
  archived_at TEXT,
  sort_order INTEGER,
  reminder_config TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
)`;

function seedGoal(
  db: IElectronDatabase,
  row: {
    id: string;
    identityId: string;
    status: string;
    deletedAt?: string | null;
    archivedAt?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  return db.execute(
    `INSERT INTO goals (
       id, identity_id, name, status, version, created_at, updated_at, deleted_at, archived_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.identityId,
      'Reconcile Goal',
      row.status,
      1,
      now,
      now,
      row.deletedAt ?? null,
      row.archivedAt ?? null,
    ],
  );
}

describe('GoalPowerSyncRepository scheduling identity (GOAL-3201 startup reconcile)', () => {
  it('enumerates every local goal reference for the Desktop startup reconcile', async () => {
    const db = createTestSqliteDatabase();
    await db.execute(GOALS_SQL);
    await seedGoal(db, { id: 'goal-active', identityId: 'identity-1', status: 'InProgress' });
    await seedGoal(db, {
      id: 'goal-archived',
      identityId: 'identity-1',
      status: 'InProgress',
      archivedAt: new Date().toISOString(),
    });
    await seedGoal(db, {
      id: 'goal-deleted',
      identityId: 'identity-2',
      status: 'InProgress',
      deletedAt: new Date().toISOString(),
    });

    const repository = new GoalPowerSyncRepository(db);

    await expect(repository.findAllGoalRefs()).resolves.toEqual([
      { id: 'goal-active', identityId: 'identity-1' },
      { id: 'goal-archived', identityId: 'identity-1' },
      { id: 'goal-deleted', identityId: 'identity-2' },
    ]);
  });

  it('feeds the projection source listGoalRefs consumed by the runtime reconcile', async () => {
    const db = createTestSqliteDatabase();
    await db.execute(GOALS_SQL);
    await seedGoal(db, { id: 'goal-1', identityId: 'identity-1', status: 'InProgress' });
    await seedGoal(db, { id: 'goal-2', identityId: 'identity-1', status: 'InProgress' });

    const source = createGoalScheduleProjectionSource({
      goalRepository: new GoalPowerSyncRepository(db),
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
    });

    await expect(source.listGoalRefs?.()).resolves.toEqual([
      { goalId: 'goal-1', identityId: 'identity-1' },
      { goalId: 'goal-2', identityId: 'identity-1' },
    ]);
  });
});
