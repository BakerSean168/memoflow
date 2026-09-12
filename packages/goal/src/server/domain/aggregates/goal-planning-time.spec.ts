import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import { Goal } from './goal';
import { GoalInvalidPlanningWindowError } from '../value-objects';

function createGoal() {
  return Goal.create({
    identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
    name: 'Planning target',
    summary: null,
    startDate: requireYmd('2026-10-15'),
    target: { kind: 'quarter', year: 2026, quarter: 4 },
    reminderConfig: null,
  });
}

describe('Goal planning time', () => {
  it('allows a start date inside a coarse target timeframe', () => {
    const goal = createGoal();

    expect(goal.startDate).toBe('2026-10-15');
    expect(goal.target).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
  });

  it('rejects creation when the start date is after the target timeframe end', () => {
    expect(() =>
      Goal.create({
        identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
        name: 'Invalid planning target',
        summary: null,
        startDate: requireYmd('2027-01-01'),
        target: { kind: 'quarter', year: 2026, quarter: 4 },
        reminderConfig: null,
      }),
    ).toThrow(GoalInvalidPlanningWindowError);
  });

  it('validates the complete next planning window before mutating either field', () => {
    const goal = createGoal();

    expect(() =>
      goal.updatePlanningTime({
        startDate: requireYmd('2027-01-01'),
        target: { kind: 'year', year: 2026 },
      }),
    ).toThrow(GoalInvalidPlanningWindowError);

    expect(goal.startDate).toBe('2026-10-15');
    expect(goal.target).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
  });

  it('compares Ymd boundaries without ambient timezone conversion', () => {
    const goal = createGoal();

    goal.updatePlanningTime({
      startDate: requireYmd('2028-02-29'),
      target: { kind: 'month', year: 2028, month: 2 },
    });

    expect(goal.startDate).toBe('2028-02-29');
    expect(goal.target).toEqual({ kind: 'month', year: 2028, month: 2 });
  });
});
