/**
 * 目标状态 — GOAL-7202 explicit lifecycle
 *
 * Goal answers only Direction + Measurement.
 * `archivedAt` is a display/persistence attribute, not a status value.
 */
export const GoalStatus = {
  Planned: 'Planned',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Abandoned: 'Abandoned',
} as const;

export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];
