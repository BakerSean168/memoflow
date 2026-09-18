import { describe, expect, it } from 'vitest';
import { GoalStatus } from '../value-objects/goal-status';
import { GoalHomeProgressSummarySchema } from './response-schemas';

const item = {
  id: 'GoalId_00000000-0000-4000-8000-000000000001',
  name: 'Ship MemoFlow',
  progress: 42,
  status: GoalStatus.InProgress,
  target: null,
  keyResultCount: 3,
};

describe('GoalHomeProgressSummarySchema', () => {
  it('accepts only the narrow Goal-owned Home shape', () => {
    expect(
      GoalHomeProgressSummarySchema.parse({ activeCount: 8, goals: [item] }),
    ).toEqual({ activeCount: 8, goals: [item] });
  });

  it('rejects invalid percentages and more than five preview rows', () => {
    expect(
      GoalHomeProgressSummarySchema.safeParse({
        activeCount: 1,
        goals: [{ ...item, progress: 101 }],
      }).success,
    ).toBe(false);
    expect(
      GoalHomeProgressSummarySchema.safeParse({
        activeCount: 6,
        goals: Array.from({ length: 6 }, (_, index) => ({
          ...item,
          id: `GoalId_00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        })),
      }).success,
    ).toBe(false);
  });
});
