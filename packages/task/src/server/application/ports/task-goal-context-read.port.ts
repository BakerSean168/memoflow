import type {
  TaskGoalContextPage,
  TaskGoalContextPageRequest,
  TaskGoalContextSummary,
} from '@memoflow/contracts/task';

/**
 * Task-owned Goal context read capability (ADR-069).
 * Goal Workspace consumes this port instead of reading Task persistence/repositories.
 */
export interface TaskGoalContextReadPort {
  listTasksByGoal(
    identityId: string,
    goalId: string,
    page?: TaskGoalContextPageRequest,
  ): Promise<TaskGoalContextPage>;

  listTasksByKeyResult(
    identityId: string,
    goalId: string,
    keyResultId: string,
    page?: TaskGoalContextPageRequest,
  ): Promise<TaskGoalContextPage>;

  getTaskGoalContextSummary(identityId: string, goalId: string): Promise<TaskGoalContextSummary>;
}
