import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import {
  ReminderTriggerType,
  goalTimeframeEndBoundary,
  goalTimeframeStartBoundary,
} from '@memoflow/contracts/goal';
import { Goal } from './goal';
import {
  GoalInvalidPlanningWindowError,
  GoalInvalidReminderWindowError,
  GoalReminderConfig,
} from '../value-objects';

function createGoal() {
  return Goal.create({
    identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
    name: 'Planning target',
    summary: null,
    start: { kind: 'quarter', year: 2026, quarter: 4 },
    target: { kind: 'quarter', year: 2027, quarter: 2 },
    reminderConfig: null,
  });
}

describe('Goal planning time', () => {
  it('preserves coarse start and target precision instead of collapsing them into dates', () => {
    const goal = createGoal();

    expect(goal.start).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
    expect(goal.target).toEqual({ kind: 'quarter', year: 2027, quarter: 2 });
    expect(goalTimeframeStartBoundary(goal.start!)).toBe(requireYmd('2026-10-01'));
    expect(goalTimeframeEndBoundary(goal.target!)).toBe(requireYmd('2027-06-30'));
  });

  it('allows semantic start and target periods whose derived planning boundaries overlap', () => {
    const goal = Goal.create({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
      name: 'Overlapping planning target',
      summary: null,
      start: { kind: 'month', year: 2026, month: 12 },
      target: { kind: 'quarter', year: 2026, quarter: 4 },
      reminderConfig: null,
    });

    expect(goal.start).toEqual({ kind: 'month', year: 2026, month: 12 });
    expect(goal.target).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
  });

  it('rejects creation when the semantic start begins after the target period ends', () => {
    expect(() =>
      Goal.create({
        identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
        name: 'Invalid planning target',
        summary: null,
        start: { kind: 'year', year: 2027 },
        target: { kind: 'quarter', year: 2026, quarter: 4 },
        reminderConfig: null,
      }),
    ).toThrow(GoalInvalidPlanningWindowError);
  });

  it('validates the complete next planning window before mutating either field', () => {
    const goal = createGoal();

    expect(() =>
      goal.updatePlanningTime({
        start: { kind: 'year', year: 2028 },
        target: { kind: 'year', year: 2027 },
      }),
    ).toThrow(GoalInvalidPlanningWindowError);

    expect(goal.start).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
    expect(goal.target).toEqual({ kind: 'quarter', year: 2027, quarter: 2 });
  });

  it('rejects a target-relative reminder that falls before the Goal starts', () => {
    const reminderConfig = GoalReminderConfig.create({
      enabled: true,
      triggers: [{ type: ReminderTriggerType.RemainingDays, value: 7, enabled: true }],
    });

    expect(() =>
      Goal.create({
        identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
        name: 'Short goal',
        summary: null,
        start: { kind: 'day', date: requireYmd('2026-09-27') },
        target: { kind: 'day', date: requireYmd('2026-09-30') },
        reminderConfig,
      }),
    ).toThrow(GoalInvalidReminderWindowError);
  });

  it('rejects adding a target-relative reminder outside the existing planning window', () => {
    const goal = Goal.create({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
      name: 'Short goal',
      summary: null,
      start: { kind: 'day', date: requireYmd('2026-09-27') },
      target: { kind: 'day', date: requireYmd('2026-09-30') },
      reminderConfig: null,
    });

    expect(() =>
      goal.updateReminderConfig({
        enabled: true,
        triggers: [{ type: ReminderTriggerType.RemainingDays, value: 7, enabled: true }],
      }),
    ).toThrow(GoalInvalidReminderWindowError);
  });

  it('rejects shrinking the planning window past an existing relative reminder', () => {
    const goal = Goal.create({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001' as never,
      name: 'Reminder window',
      summary: null,
      start: { kind: 'day', date: requireYmd('2026-09-01') },
      target: { kind: 'day', date: requireYmd('2026-09-30') },
      reminderConfig: GoalReminderConfig.create({
        enabled: true,
        triggers: [{ type: ReminderTriggerType.RemainingDays, value: 7, enabled: true }],
      }),
    });

    expect(() =>
      goal.updatePlanningTime({
        start: { kind: 'day', date: requireYmd('2026-09-27') },
      }),
    ).toThrow(GoalInvalidReminderWindowError);
    expect(goal.start).toEqual({ kind: 'day', date: requireYmd('2026-09-01') });
  });

  it('derives leap-day boundaries without ambient timezone conversion', () => {
    const goal = createGoal();

    goal.updatePlanningTime({
      start: { kind: 'month', year: 2028, month: 2 },
      target: { kind: 'day', date: requireYmd('2028-02-29') },
    });

    expect(goal.start).toEqual({ kind: 'month', year: 2028, month: 2 });
    expect(goalTimeframeStartBoundary(goal.start!)).toBe(requireYmd('2028-02-01'));
    expect(goalTimeframeEndBoundary(goal.target!)).toBe(requireYmd('2028-02-29'));
  });
});
