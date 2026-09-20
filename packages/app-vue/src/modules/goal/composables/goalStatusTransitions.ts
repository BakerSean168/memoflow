import { GoalStatus, type GoalStatus as GoalStatusValue } from '@memoflow/contracts/goal';

const transitions: Record<GoalStatusValue, readonly GoalStatusValue[]> = {
  [GoalStatus.Planned]: [GoalStatus.InProgress, GoalStatus.Abandoned],
  [GoalStatus.InProgress]: [GoalStatus.Planned, GoalStatus.Completed, GoalStatus.Abandoned],
  [GoalStatus.Completed]: [GoalStatus.InProgress],
  [GoalStatus.Abandoned]: [GoalStatus.Planned, GoalStatus.InProgress],
};

/** Keep the editor aligned with the aggregate lifecycle instead of bypassing it. */
export function editableGoalStatuses(current: GoalStatusValue): readonly GoalStatusValue[] {
  return [current, ...transitions[current]];
}

export function isGoalStatusTransitionAllowed(from: GoalStatusValue, to: GoalStatusValue): boolean {
  return from === to || transitions[from].includes(to);
}
