import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { expect, it } from 'vitest';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createTimeContext } from '@memoflow/time';
import { createTaskPowerSyncReadQueries } from './task-page-reader';

it('reads existing owned plan and occurrence pages with Product Time and no materialization', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE task_plans (id TEXT PRIMARY KEY, identity_id TEXT, name TEXT, status TEXT, outcome TEXT, completion_policy TEXT, importance TEXT, schedule TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT, archived_at TEXT);
  CREATE TABLE task_occurrences (id TEXT PRIMARY KEY, plan_id TEXT, identity_id TEXT, occurrence_key TEXT, schedule_date TEXT, schedule_timing TEXT, importance_snapshot TEXT, status TEXT, actual_start_at TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT);`);
  const db: IElectronDatabase = {
    async execute(q, p = []) {
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
  const owner = 'IdentityId_00000000-0000-4000-8000-000000000001';
  const plan = (i: number) => `ITaskPlanId_00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const occurrence = (i: number) =>
    `ITaskOccurrenceId_00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  try {
    for (const i of [1, 2, 3]) {
      sql
        .prepare(
          'INSERT INTO task_plans (id,identity_id,name,status,outcome,completion_policy,importance,schedule,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          plan(i),
          i === 3 ? 'other' : owner,
          'Read_%',
          'Active',
          'Open',
          'AllowCorrection',
          'Moderate',
          JSON.stringify({ kind: 'OneTime', date: '2026-11-01', timing: { kind: 'AllDay' } }),
          1,
          '2026-10-01T00:00:00.000Z',
          '2026-10-01T00:00:00.000Z',
        );
      sql
        .prepare(
          'INSERT INTO task_occurrences (id,plan_id,identity_id,occurrence_key,schedule_date,schedule_timing,importance_snapshot,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          occurrence(i),
          plan(i),
          owner,
          '2026-11-01',
          '2026-11-01',
          '{"kind":"AllDay"}',
          'Moderate',
          'Pending',
          1,
          '2026-10-01T00:00:00.000Z',
          '2026-10-01T00:00:00.000Z',
        );
    }
    const reads = createTaskPowerSyncReadQueries(db, {
      getUserTimeContext: async () =>
        createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 }),
    });
    const first = await reads.searchTaskPlans(owner, { query: '_%', limit: 1 });
    expect(first).toMatchObject({ ok: true, data: { items: [{ id: plan(2) }], hasMore: true } });
    const second = await reads.searchTaskPlans(owner, {
      query: '_%',
      limit: 1,
      after: { id: plan(2), createdAt: Date.parse('2026-10-01T00:00:00Z') },
    });
    expect(second).toMatchObject({ ok: true, data: { items: [{ id: plan(1) }], hasMore: false } });
    expect(await reads.getTaskPlan(owner, plan(3))).toMatchObject({ ok: true, data: null });
    expect(await reads.getTaskOccurrence(owner, occurrence(3))).toMatchObject({
      ok: true,
      data: null,
    });
    const range = {
      startDate: Date.parse('2026-11-01T04:00:00Z'),
      endDate: Date.parse('2026-11-02T04:59:59Z'),
      limit: 1,
    };
    expect(await reads.listTaskOccurrences(owner, range)).toMatchObject({
      ok: true,
      data: { items: [{ id: occurrence(1) }], hasMore: true, timeZone: 'America/New_York' },
    });
    expect(await reads.listTaskOccurrences(owner, { ...range, timeZone: 'UTC' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CURSOR' },
    });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM task_occurrences').get()).toMatchObject({ n: 3 });
  } finally {
    sql.close();
  }
});
