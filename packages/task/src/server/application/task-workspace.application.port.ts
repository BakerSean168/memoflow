import type { GetTaskWorkspaceReq, TaskPlanWorkspace } from '@memoflow/workspace-contracts';
import type { Result } from '@memoflow/contracts/result';
export interface TaskWorkspaceApplicationPort {
  getWorkspace(
    identityId: string,
    planId: string,
    request?: GetTaskWorkspaceReq,
  ): Promise<Result<TaskPlanWorkspace>>;
}
