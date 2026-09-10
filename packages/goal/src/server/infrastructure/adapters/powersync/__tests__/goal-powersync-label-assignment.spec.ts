import Database from 'better-sqlite3';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { describe, expect, it } from 'vitest';
import { GoalLabelOwnershipError } from '../../../../domain';
import { GoalPowerSyncRepository } from '../goal-powersync.repository';

function createDatabase(): IElectronDatabase & { close(): void } {
  const sqlite = new Database(':memory:');
  const db: IElectronDatabase & { close(): void } = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const info = sqlite.prepare(sql).run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      return (sqlite.prepare(sql).get(...(parameters ?? [])) as T | undefined) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const row = sqlite.prepare(sql).get(...(parameters ?? [])) as T | undefined;
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row;
    },
    async writeTransaction<T>(work: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await work(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
  return db;
}

async function createSchema(db: IElectronDatabase): Promise<void> {
  await db.execute(`CREATE TABLE goals (
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
    sort_order INTEGER NOT NULL DEFAULT 0,
    reminder_config TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`);
  await db.execute(`CREATE TABLE labels (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE goal_labels (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    label_id TEXT NOT NULL
  )`);
}

async function seedGoal(db: IElectronDatabase, id: string, identityId: string): Promise<void> {
  const now = '2026-09-09T00:00:00.000Z';
  await db.execute(
    `INSERT INTO goals (id, identity_id, name, status, sort_order, version, created_at, updated_at)
     VALUES (?, ?, ?, 'Active', 0, 1, ?, ?)`,
    [id, identityId, id, now, now],
  );
}

async function seedLabel(
  db: IElectronDatabase,
  id: string,
  identityId: string,
  name: string,
): Promise<void> {
  const now = '2026-09-09T00:00:00.000Z';
  await db.execute(
    `INSERT INTO labels (id, identity_id, name, normalized_name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [id, identityId, name, name.toLowerCase(), now, now],
  );
}

describe('GoalPowerSyncRepository label ownership parity', () => {
  it('deduplicates replacement, projects labels, and applies duplicate-insensitive AND filtering', async () => {
    const db = createDatabase();
    try {
      await createSchema(db);
      await seedGoal(db, 'goal-both', 'identity-1');
      await seedGoal(db, 'goal-work', 'identity-1');
      await seedLabel(db, 'label-work', 'identity-1', 'Work');
      await seedLabel(db, 'label-ai', 'identity-1', 'AI');
      const repository = new GoalPowerSyncRepository(db);

      const replaced = await repository.replaceLabels('identity-1', 'goal-both', [
        'label-work',
        'label-ai',
        'label-work',
      ]);
      await repository.replaceLabels('identity-1', 'goal-work', ['label-work']);

      expect(replaced.map((label) => label.id).sort()).toEqual(['label-ai', 'label-work']);
      const rows = await db.getAll<{ label_id: string }>(
        'SELECT label_id FROM goal_labels WHERE identity_id = ? AND goal_id = ? ORDER BY label_id',
        ['identity-1', 'goal-both'],
      );
      expect(rows.map((row) => row.label_id)).toEqual(['label-ai', 'label-work']);

      const result = await repository.findByIdentityId('identity-1', {
        includeChildren: false,
        labelIdsAll: ['label-work', 'label-ai', 'label-work'],
      });
      expect(result.map((goal) => String(goal.id))).toEqual(['goal-both']);
      expect(result[0]?.labels.map((label) => label.id).sort()).toEqual(['label-ai', 'label-work']);
    } finally {
      db.close();
    }
  });

  it('rejects foreign labels before deleting the existing assignment and rejects foreign owners', async () => {
    const db = createDatabase();
    try {
      await createSchema(db);
      await seedGoal(db, 'goal-1', 'identity-1');
      await seedGoal(db, 'goal-foreign', 'identity-2');
      await seedLabel(db, 'label-own', 'identity-1', 'Own');
      await seedLabel(db, 'label-foreign', 'identity-2', 'Foreign');
      const repository = new GoalPowerSyncRepository(db);

      await repository.replaceLabels('identity-1', 'goal-1', ['label-own']);
      await expect(
        repository.replaceLabels('identity-1', 'goal-1', ['label-foreign']),
      ).rejects.toBeInstanceOf(GoalLabelOwnershipError);
      await expect(
        repository.replaceLabels('identity-1', 'goal-foreign', ['label-own']),
      ).rejects.toThrow('Goal not found.');

      const remaining = await db.getAll<{ label_id: string }>(
        'SELECT label_id FROM goal_labels WHERE identity_id = ? AND goal_id = ?',
        ['identity-1', 'goal-1'],
      );
      expect(remaining.map((row) => row.label_id)).toEqual(['label-own']);
    } finally {
      db.close();
    }
  });
});
