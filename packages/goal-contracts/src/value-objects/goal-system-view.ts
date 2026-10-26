/** Derived Goal list views. These are not labels or business statuses. */
export const GoalSystemView = {
  Active: 'active',
  Completed: 'completed',
  All: 'all',
  Archived: 'archived',
  Abandoned: 'abandoned',
} as const;

export type GoalSystemView = (typeof GoalSystemView)[keyof typeof GoalSystemView];
