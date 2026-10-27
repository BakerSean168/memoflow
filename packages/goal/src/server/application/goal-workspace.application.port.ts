import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceKnowledgePage,
  GoalWorkspacePageRequest,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPageRequest,
} from '@memoflow/workspace-contracts';
import type { TaskGoalContextPage } from '@memoflow/task-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

/** Read-only ADR-069 Goal Workspace application surface. */
export interface GoalWorkspaceApplicationPort {
  getWorkspace(
    identityId: string,
    goalId: string,
    request?: GetGoalWorkspaceReq,
  ): Promise<Result<GoalWorkspaceReadModel>>;
  listTasks(
    identityId: string,
    goalId: string,
    request?: GoalWorkspaceTaskPageRequest,
  ): Promise<Result<TaskGoalContextPage>>;
  listKnowledge(
    identityId: string,
    goalId: string,
    request?: GoalWorkspacePageRequest,
  ): Promise<Result<GoalWorkspaceKnowledgePage>>;
}
