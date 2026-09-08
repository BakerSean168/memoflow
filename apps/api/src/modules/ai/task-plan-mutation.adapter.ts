import type { TaskPlanMutationPort } from '@memoflow/ai';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { error, ok } from '@memoflow/contracts/result';
import type { LabelService } from '@memoflow/label';
import type { TaskApplicationPort } from '@memoflow/task';

/**
 * API-host binding for the Mastra `task.create` workflow. It delegates to the
 * already-composed Task application port and never reimplements feature business
 * rules.
 */
export class TaskPlanMutationAdapter implements TaskPlanMutationPort {
  constructor(
    private readonly task: TaskApplicationPort,
    private readonly labels: LabelService,
  ) {}

  async resolveLabels(
    names: readonly string[],
    context: Parameters<TaskPlanMutationPort['resolveLabels']>[1],
  ) {
    try {
      const labels = await this.labels.resolveNames(context.identityId, names);
      return ok(labels.map((label) => label.id));
    } catch (cause) {
      return error(
        'AI_LABEL_RESOLUTION_FAILED',
        cause instanceof Error ? cause.message : 'Failed to resolve Shared Labels',
      );
    }
  }

  async createTaskPlan(
    request: Parameters<TaskPlanMutationPort['createTaskPlan']>[0],
    context: Parameters<TaskPlanMutationPort['createTaskPlan']>[1],
  ) {
    const result = await this.task.createTaskPlan({
      ...request,
      identityId: context.identityId as IdentityId,
    });
    if (!result.ok) return result;
    return ok({ taskId: String(result.data.template.id) });
  }
}
