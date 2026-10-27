import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { IElectronDatabase, IElectronDatabaseQueryResult } from '@memoflow/desktop-contracts';
import { createPowerSyncClosureChecker } from '../../../powersync';

function createTestSqliteDatabase(): IElectronDatabase {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY, status TEXT)');
  sqlite.exec(
    'CREATE TABLE account_closure_requested (identity_id TEXT PRIMARY KEY, requested_at INTEGER)',
  );
  const wrapper: IElectronDatabase = {
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

describe('Notification PowerSync closureChecker (Desktop local new-work gate)', () => {
  const identityId = 'IdentityId_desktop-close-window-2';
  let db: IElectronDatabase;

  beforeEach(() => {
    db = createTestSqliteDatabase();
    db.execute('INSERT INTO accounts (id, status) VALUES (?, ?)', [identityId, 'Active']);
  });

  it('allows new work while account is Active and no close marker exists', async () => {
    const blocked = await createPowerSyncClosureChecker(db)(identityId);
    expect(blocked).toBe(false);
  });

  it('blocks new work during the requested/revoking window (local marker set, account still Active)', async () => {
    await db.execute(
      'INSERT INTO account_closure_requested (identity_id, requested_at) VALUES (?, ?)',
      [identityId, Date.now()],
    );
    const blocked = await createPowerSyncClosureChecker(db)(identityId);
    expect(blocked).toBe(true);
  });

  it('blocks new work when account is Deactivated', async () => {
    await db.execute('UPDATE accounts SET status = ? WHERE id = ?', ['Deactivated', identityId]);
    const blocked = await createPowerSyncClosureChecker(db)(identityId);
    expect(blocked).toBe(true);
  });

  it('blocks new work when account row is missing (fail-closed)', async () => {
    const blocked = await createPowerSyncClosureChecker(db)('IdentityId_unknown');
    expect(blocked).toBe(true);
  });
});
