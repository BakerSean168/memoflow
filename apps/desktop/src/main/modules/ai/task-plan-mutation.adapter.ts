import type { TaskPlanMutationPort } from '@memoflow/ai';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { error, ok } from '@memoflow/contracts/result';
import type { LabelService } from '@memoflow/label';
import type { TaskApplicationPort } from '@memoflow/task';

/** Desktop-host binding for the Mastra `task.create` Workflow. */
export class DesktopTaskPlanMutationAdapter implements TaskPlanMutationPort {
  constructor(
    private readonly task: TaskApplicationPort,
    private readonly labels: LabelService,
  ) {}

  async readTaskPlan(id: string, context: Parameters<TaskPlanMutationPort['readTaskPlan']>[1]) {
    const result = await this.task.getTaskPlan(id, context.identityId);
    if (!result.ok) return result;
    if (!result.data) return error('NOT_FOUND', 'Task plan not found');
    return ok({ taskId: String(result.data.id) });
  }

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
    return ok({ taskId: String(result.data.plan.id) });
  }
}
