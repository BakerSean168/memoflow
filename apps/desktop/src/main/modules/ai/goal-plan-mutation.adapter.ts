import type { GoalPlanMutationPort } from '@memoflow/ai';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { error, ok } from '@memoflow/contracts/result';
import type { LabelService } from '@memoflow/label';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { ReminderApplicationPort } from '@memoflow/reminder';
import type { TaskApplicationPort } from '@memoflow/task';

/** Desktop-host binding for the ADR-052 goal.create Workflow. */
export class DesktopGoalPlanMutationAdapter implements GoalPlanMutationPort {
  constructor(
    private readonly goal: GoalApplicationPort,
    private readonly task: TaskApplicationPort,
    private readonly reminder: ReminderApplicationPort,
    private readonly labels: LabelService,
  ) {}

  async resolveLabels(
    names: readonly string[],
    context: Parameters<GoalPlanMutationPort['resolveLabels']>[1],
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

  async createGoal(request: Parameters<GoalPlanMutationPort['createGoal']>[0], context: Parameters<GoalPlanMutationPort['createGoal']>[1]) {
    const result = await this.goal.createGoal(request, context);
    if (!result.ok) return result;
    return ok({
      goalId: String(result.data.goalId),
      keyResultIds: result.data.affectedEntityIds.keyResultIds.map(String),
    });
  }

  async createTaskPlan(
    request: Parameters<GoalPlanMutationPort['createTaskPlan']>[0],
    context: Parameters<GoalPlanMutationPort['createTaskPlan']>[1],
  ) {
    const result = await this.task.createTaskPlan({
      ...request,
      identityId: context.identityId as IdentityId,
    });
    if (!result.ok) return result;
    return ok({ taskId: String(result.data.template.id) });
  }

  async createReminder(
    request: Parameters<GoalPlanMutationPort['createReminder']>[0],
    context: Parameters<GoalPlanMutationPort['createReminder']>[1],
  ) {
    const result = await this.reminder.createTemplate(request, context);
    if (!result.ok) return result;
    return ok({ reminderId: String(result.data.id) });
  }
}
