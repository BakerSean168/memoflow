import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceKnowledgePage,
  GoalWorkspacePageRequest,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPage,
  GoalWorkspaceTaskPageRequest,
} from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';

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
  ): Promise<Result<GoalWorkspaceTaskPage>>;
  listKnowledge(
    identityId: string,
    goalId: string,
    request?: GoalWorkspacePageRequest,
  ): Promise<Result<GoalWorkspaceKnowledgePage>>;
}
