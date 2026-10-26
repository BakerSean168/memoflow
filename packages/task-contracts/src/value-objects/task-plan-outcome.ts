/** Canonical outcome of a Task execution plan. */
export const TaskPlanOutcome = {
  Open: 'Open',
  Succeeded: 'Succeeded',
  Failed: 'Failed',
  Abandoned: 'Abandoned',
} as const;

export type TaskPlanOutcome = (typeof TaskPlanOutcome)[keyof typeof TaskPlanOutcome];
