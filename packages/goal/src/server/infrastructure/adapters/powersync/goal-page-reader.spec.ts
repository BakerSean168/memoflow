import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createGoalPowerSyncPageQuery } from './goal-page-reader';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE goals (id TEXT PRIMARY KEY, identity_id TEXT, name TEXT, summary TEXT, status TEXT DEFAULT 'Planned', version INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT, deleted_at TEXT, archived_at TEXT, start_kind TEXT, start_date TEXT, target_kind TEXT, target_end_date TEXT, completed_at TEXT, sort_order INTEGER DEFAULT 0);
  CREATE TABLE key_results (id TEXT, goal_id TEXT, title TEXT, unit TEXT, initial_value REAL, current_value REAL, tracking_base_value REAL, target_value REAL, aggregation_method TEXT, target_kind TEXT, target_end_date TEXT, weight INTEGER, "order" INTEGER, created_at TEXT, updated_at TEXT);`);
  const db: IElectronDatabase = {
    async execute(q, p) {
      return { rowsAffected: Number(sql.prepare(q).run(...(p as SQLInputValue[])).changes) };
    },
    async getAll<T>(q: string, p: unknown[] = []) {
      return sql.prepare(q).all(...(p as SQLInputValue[])) as T[];
    },
    async getOptional<T>(q: string, p: unknown[] = []) {
      return (sql.prepare(q).get(...(p as SQLInputValue[])) ?? null) as T | null;
    },
    async get<T>(q: string, p: unknown[] = []) {
      return sql.prepare(q).get(...(p as SQLInputValue[])) as T;
    },
    async writeTransaction(work) {
      sql.exec('BEGIN');
      try {
        const result = await work(db);
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, sql };
}
describe('Profile-local bounded Goal reads', () => {
  it('pages within the owner, treats wildcard text literally and excludes removed goals', async () => {
    const { db, sql } = database();
    try {
      for (const [id, owner, deleted] of [
        [
          'IGoalId_00000000-0000-4000-8000-000000000001',
          'IdentityId_00000000-0000-4000-8000-000000000001',
          null,
        ],
        [
          'IGoalId_00000000-0000-4000-8000-000000000002',
          'IdentityId_00000000-0000-4000-8000-000000000001',
          null,
        ],
        [
          'IGoalId_00000000-0000-4000-8000-000000000003',
          'IdentityId_00000000-0000-4000-8000-000000000002',
          null,
        ],
        [
          'IGoalId_00000000-0000-4000-8000-000000000004',
          'IdentityId_00000000-0000-4000-8000-000000000001',
          '2026-10-01',
        ],
      ])
        sql
          .prepare(
            'INSERT INTO goals(id,identity_id,name,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?)',
          )
          .run(
            id,
            owner,
            '100% Goal',
            '2026-10-01T00:00:00.000Z',
            '2026-10-01T00:00:00.000Z',
            deleted,
          );
      const reads = createGoalPowerSyncPageQuery(db);
      const page = await reads.searchGoalPage('IdentityId_00000000-0000-4000-8000-000000000001', {
        query: '%',
        limit: 1,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) throw new Error('Expected page');
      expect(page.data.items.map((i) => i.id)).toEqual([
        'IGoalId_00000000-0000-4000-8000-000000000002',
      ]);
      expect(page.data.hasMore).toBe(true);
      const next = await reads.searchGoalPage('IdentityId_00000000-0000-4000-8000-000000000001', {
        query: '%',
        limit: 1,
        after: page.data.next,
      });
      expect(next).toMatchObject({
        ok: true,
        data: { items: [{ id: 'IGoalId_00000000-0000-4000-8000-000000000001' }], hasMore: false },
      });
      expect(
        await reads.getGoal(
          'IdentityId_00000000-0000-4000-8000-000000000001',
          'IGoalId_00000000-0000-4000-8000-000000000003',
        ),
      ).toMatchObject({ ok: true, data: null });
      expect(
        await reads.getGoal(
          'IdentityId_00000000-0000-4000-8000-000000000001',
          'IGoalId_00000000-0000-4000-8000-000000000004',
        ),
      ).toMatchObject({ ok: true, data: null });
      sql
        .prepare('UPDATE goals SET summary = ? WHERE id = ?')
        .run('x'.repeat(17000), 'IGoalId_00000000-0000-4000-8000-000000000001');
      expect(
        await reads.getGoal(
          'IdentityId_00000000-0000-4000-8000-000000000001',
          'IGoalId_00000000-0000-4000-8000-000000000001',
        ),
      ).toMatchObject({ ok: false, error: { code: 'RESPONSE_TOO_LARGE' } });
    } finally {
      sql.close();
    }
  });
});
