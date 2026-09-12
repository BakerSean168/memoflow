/** Canonical Task plan lifecycle. Archive/delete are orthogonal metadata. */
export const TaskPlanStatus = {
  Active: 'Active',
  Paused: 'Paused',
  Closed: 'Closed',
} as const;

export type TaskPlanStatus = (typeof TaskPlanStatus)[keyof typeof TaskPlanStatus];
