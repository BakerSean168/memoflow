import type { TaskPlanExecutionReceipt } from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { CreateTaskPlanReq } from '@memoflow/contracts/task';
import type { TaskPlanMutationResult } from './goal-plan-mutation.port';

/**
 * Narrow host binding consumed by the Mastra task.create workflow.
 *
 * Mirrors `GoalPlanMutationPort`: the AI package owns orchestration and request
 * mapping; the API/Desktop host binds these calls to the already-composed Task
 * application port. Domain writes stay behind the canonical application port and
 * are never performed directly by the Mastra agent/workflow.
 */
export interface TaskPlanMutationPort {
  resolveLabels(
    names: readonly string[],
    context: ExecutionContext,
  ): Promise<Result<string[]>>;
  createTaskPlan(
    request: CreateTaskPlanReq,
    context: ExecutionContext,
  ): Promise<Result<TaskPlanMutationResult>>;
}

export interface ApplyTaskPlanInput {
  readonly workflowRunId: string;
  readonly draft: import('@memoflow/contracts/ai').TaskPlanDraft;
  readonly context: ExecutionContext;
  readonly priorReceipt?: TaskPlanExecutionReceipt;
}
