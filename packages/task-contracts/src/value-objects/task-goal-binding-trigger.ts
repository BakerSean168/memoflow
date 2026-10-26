/** When a configured Task contribution settles into its linked Goal KR. */
export const TaskGoalBindingTrigger = {
  EachCompletion: 'EachCompletion',
  PlanCompletion: 'PlanCompletion',
} as const;
export type TaskGoalBindingTrigger =
  (typeof TaskGoalBindingTrigger)[keyof typeof TaskGoalBindingTrigger];
