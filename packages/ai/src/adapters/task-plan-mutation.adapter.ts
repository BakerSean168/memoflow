import type { CreateTaskPlanReq, TaskPlanClientDTO } from '@memoflow/task-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { error, ok } from '@memoflow/transport-contracts/result';
import type { TaskPlanMutationPort } from '../server/mastra/workflows/task-plan-mutation.port';

/** Task owner capabilities used by the `task.create` workflow binding. */
export interface TaskPlanMutationAdapterDeps {
  readonly task: {
    getTaskPlan(id: string, identityId: string): Promise<Result<TaskPlanClientDTO | null>>;
    createTaskPlan(
      request: CreateTaskPlanReq & { identityId: string },
    ): Promise<Result<{ readonly plan: { readonly id: string } }>>;
  };
  readonly labels: {
    resolveNames(identityId: string, names: readonly string[]): Promise<readonly { id: string }[]>;
  };
}

/**
 * Canonical `task.create` workflow binding. It delegates to the already-composed
 * Task application capability and never reimplements feature business rules.
 */
export function createTaskPlanMutationAdapter(
  deps: TaskPlanMutationAdapterDeps,
): TaskPlanMutationPort {
  return {
    async readTaskPlan(id, context) {
      const result = await deps.task.getTaskPlan(id, context.identityId);
      if (!result.ok) return result;
      if (!result.data) return error('NOT_FOUND', 'Task plan not found');
      return ok({ taskId: String(result.data.id) });
    },

    async resolveLabels(names, context) {
      try {
        const labels = await deps.labels.resolveNames(context.identityId, names);
        return ok(labels.map((label) => label.id));
      } catch (cause) {
        return error(
          'AI_LABEL_RESOLUTION_FAILED',
          cause instanceof Error ? cause.message : 'Failed to resolve Shared Labels',
        );
      }
    },

    async createTaskPlan(request, context) {
      const result = await deps.task.createTaskPlan({
        ...request,
        identityId: context.identityId,
      });
      if (!result.ok) return result;
      return ok({ taskId: String(result.data.plan.id) });
    },
  };
}
