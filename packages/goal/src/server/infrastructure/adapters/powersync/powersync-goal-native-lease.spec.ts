import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { PowerSyncGoalWriteTransactionRunner } from './powersync-goal-write-transaction-runner';

function sqliteHarness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE ai_goal_surface_leases (
      identity_id TEXT NOT NULL, run_id TEXT NOT NULL, owner_token TEXT,
      fence INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY (identity_id, run_id)
    )
  `);
  const statements = {
    async execute(query: string, args: unknown[] = []) {
      return { rowsAffected: sql.prepare(query).run(...(args as SQLInputValue[])).changes };
    },
    async getOptional<T>(query: string, args: unknown[] = []) {
      return (sql.prepare(query).get(...(args as SQLInputValue[])) as T | undefined) ?? null;
    },
  };
  const db = {
    ...statements,
    async writeTransaction<T>(work: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T> {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(statements as never);
        sql.exec('COMMIT');
        return result;
      } catch (cause) {
        sql.exec('ROLLBACK');
        throw cause;
      }
    },
  } as IElectronDatabase;
  return { sql, db };
}

describe('PowerSync native Goal AI lease in the same SQLite transaction as Save', () => {
  it('accepts current fence; rejects stale owner, expired TTL and foreign identities', async () => {
    const { sql, db } = sqliteHarness();
    try {
      const runner = new PowerSyncGoalWriteTransactionRunner(db);
      const identityId = 'user-1';
      const lease = { runId: 'run-1', token: '11111111-1111-4111-8111-111111111111', fence: 1 };
      sql
        .prepare('INSERT INTO ai_goal_surface_leases VALUES (?, ?, ?, ?, ?)')
        .run(identityId, lease.runId, lease.token, lease.fence, Date.now() + 30_000);

      const proof = (who: string, grant: typeof lease) =>
        runner.run((context) => context.assertNativeAiLease!(who, grant));
      expect(await proof(identityId, lease)).toBe(true);
      expect(await proof('user-2', lease)).toBe(false);
      expect(
        await proof(identityId, { ...lease, token: '22222222-2222-4222-8222-222222222222' }),
      ).toBe(false);

      sql
        .prepare('UPDATE ai_goal_surface_leases SET owner_token = ?, fence = 2 WHERE run_id = ?')
        .run('22222222-2222-4222-8222-222222222222', lease.runId);
      expect(await proof(identityId, lease)).toBe(false);
      const current = {
        ...lease,
        token: '22222222-2222-4222-8222-222222222222',
        fence: 2,
      };
      expect(await proof(identityId, current)).toBe(true);
      sql
        .prepare('UPDATE ai_goal_surface_leases SET expires_at = ? WHERE run_id = ?')
        .run(Date.now() - 1, lease.runId);
      expect(await proof(identityId, current)).toBe(false);
    } finally {
      sql.close();
    }
  });
});
