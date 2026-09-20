import { describe, expect, it } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { editableGoalStatuses, isGoalStatusTransitionAllowed } from './goalStatusTransitions';

describe('Goal status editor lifecycle guard', () => {
  it('offers only the current status and direct aggregate transitions', () => {
    expect(editableGoalStatuses(GoalStatus.Planned)).toEqual([
      GoalStatus.Planned,
      GoalStatus.InProgress,
      GoalStatus.Abandoned,
    ]);
    expect(editableGoalStatuses(GoalStatus.Completed)).toEqual([
      GoalStatus.Completed,
      GoalStatus.InProgress,
    ]);
  });

  it('accepts same-state saves and direct transitions', () => {
    expect(isGoalStatusTransitionAllowed(GoalStatus.InProgress, GoalStatus.Completed)).toBe(true);
    expect(isGoalStatusTransitionAllowed(GoalStatus.Abandoned, GoalStatus.Planned)).toBe(true);
    expect(isGoalStatusTransitionAllowed(GoalStatus.Completed, GoalStatus.Completed)).toBe(true);
  });

  it('does not synthesize hidden multi-step lifecycle changes', () => {
    expect(isGoalStatusTransitionAllowed(GoalStatus.Planned, GoalStatus.Completed)).toBe(false);
    expect(isGoalStatusTransitionAllowed(GoalStatus.Completed, GoalStatus.Abandoned)).toBe(false);
  });
});
