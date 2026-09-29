import { describe, expect, it, vi } from 'vitest';
import {
  prepareGoalStartTimeframeSemantics,
  type GoalStartTimeframeSchemaQueryClient,
} from './goal-start-timeframe-semantics';

function result(rows: Array<Record<string, unknown>>, rowCount: number | null = rows.length) {
  return { rows, rowCount };
}

describe('prepareGoalStartTimeframeSemantics', () => {
  it('leaves a fresh database for Prisma to initialize', async () => {
    const query = vi.fn().mockResolvedValue(result([{ regclass: null }]));

    await expect(
      prepareGoalStartTimeframeSemantics({ query } as GoalStartTimeframeSchemaQueryClient),
    ).resolves.toEqual({
      tablePresent: false,
      columnAdded: false,
      rowsBackfilled: 0,
    });

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('adds start_kind and backfills legacy exact start dates as day precision', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(result([{ regclass: 'goals' }]))
      .mockResolvedValueOnce(result([])) // BEGIN
      .mockResolvedValueOnce(result([])) // start_kind absent
      .mockResolvedValueOnce(result([])) // ALTER TABLE
      .mockResolvedValueOnce(result([{ id: 'goal-1' }, { id: 'goal-2' }], 2))
      .mockResolvedValueOnce(result([])) // invariant check
      .mockResolvedValueOnce(result([])); // COMMIT

    const report = await prepareGoalStartTimeframeSemantics({
      query,
    } as GoalStartTimeframeSchemaQueryClient);

    expect(report).toEqual({
      tablePresent: true,
      columnAdded: true,
      rowsBackfilled: 2,
    });
    expect(query.mock.calls[1]?.[0]).toBe('BEGIN');
    expect(String(query.mock.calls[3]?.[0])).toContain('ADD COLUMN IF NOT EXISTS start_kind');
    expect(String(query.mock.calls[4]?.[0])).toContain("SET start_kind = 'day'");
    expect(query.mock.calls[6]?.[0]).toBe('COMMIT');
  });

  it('is idempotent when the discriminant already exists and no legacy rows remain', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(result([{ regclass: 'goals' }]))
      .mockResolvedValueOnce(result([])) // BEGIN
      .mockResolvedValueOnce(result([{ column_name: 'start_kind' }]))
      .mockResolvedValueOnce(result([])) // ALTER TABLE
      .mockResolvedValueOnce(result([], 0))
      .mockResolvedValueOnce(result([])) // invariant check
      .mockResolvedValueOnce(result([])); // COMMIT

    await expect(
      prepareGoalStartTimeframeSemantics({ query } as GoalStartTimeframeSchemaQueryClient),
    ).resolves.toEqual({
      tablePresent: true,
      columnAdded: false,
      rowsBackfilled: 0,
    });
  });

  it('fails closed if a partial persistence pair survives preparation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(result([{ regclass: 'goals' }]))
      .mockResolvedValueOnce(result([])) // BEGIN
      .mockResolvedValueOnce(result([{ column_name: 'start_kind' }]))
      .mockResolvedValueOnce(result([])) // ALTER TABLE
      .mockResolvedValueOnce(result([], 0))
      .mockResolvedValueOnce(
        result([{ id: 'goal-broken', start_kind: 'quarter', start_date: null }]),
      )
      .mockResolvedValueOnce(result([])); // ROLLBACK

    await expect(
      prepareGoalStartTimeframeSemantics({ query } as GoalStartTimeframeSchemaQueryClient),
    ).rejects.toThrow(/persistence is partial after backfill/);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
});
