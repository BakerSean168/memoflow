import type { TaskPlanExecutionReceipt } from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { CreateTaskPlanReq } from '@memoflow/task-contracts';
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
  /** Canonical identity-scoped owner truth, before replay resolves labels. */
  readTaskPlan(id: string, context: ExecutionContext): Promise<Result<TaskPlanMutationResult>>;
  resolveLabels(names: readonly string[], context: ExecutionContext): Promise<Result<string[]>>;
  createTaskPlan(
    request: CreateTaskPlanReq,
    context: ExecutionContext,
  ): Promise<Result<TaskPlanMutationResult>>;
}

export interface ApplyTaskPlanInput {
  readonly workflowRunId: string;
  readonly draft: import('@memoflow/ai-contracts').TaskPlanDraft;
  readonly context: ExecutionContext;
  readonly priorReceipt?: TaskPlanExecutionReceipt;
}
