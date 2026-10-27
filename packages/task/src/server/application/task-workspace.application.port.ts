import type { GetTaskWorkspaceReq, TaskPlanWorkspace } from '@memoflow/task-workspace-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
export interface TaskWorkspaceApplicationPort {
  getWorkspace(
    identityId: string,
    planId: string,
    request?: GetTaskWorkspaceReq,
  ): Promise<Result<TaskPlanWorkspace>>;
}
