import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GOAL_RECORD_AUTHORSHIP_MIGRATION_SQL, prepareGoalRecordAuthorship } from './goal-record-authorship';

describe('GoalRecord authorship migration', () => {
  it('keeps bootstrap SQL identical to the standalone transactional backfill and CHECK migration', () => {
    expect(GOAL_RECORD_AUTHORSHIP_MIGRATION_SQL).toBe(readFileSync(new URL('../../prisma/migrations/add-goal-record-authorship.sql', import.meta.url), 'utf8'));
    const schema = readFileSync(new URL('../../prisma/schema/goal.prisma', import.meta.url), 'utf8');
    expect(schema).toMatch(/authorship\s+String\s+@default\("Manual"\)/);
  });
  it('skips a missing table', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ regclass: null }], rowCount: 1 });
    expect(await prepareGoalRecordAuthorship({ query })).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('applies the backfill before enforcing non-null and constraints', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ regclass: 'goal_records' }], rowCount: 1 });
    expect(await prepareGoalRecordAuthorship({ query })).toBe(true);
    expect(query).toHaveBeenLastCalledWith(GOAL_RECORD_AUTHORSHIP_MIGRATION_SQL);
  });
  it('rolls back failed migration rather than leaving a transaction open', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ regclass: 'goal_records' }], rowCount: 1 })
      .mockRejectedValueOnce(new Error('invalid legacy source')).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(prepareGoalRecordAuthorship({ query })).rejects.toThrow('invalid legacy source');
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
