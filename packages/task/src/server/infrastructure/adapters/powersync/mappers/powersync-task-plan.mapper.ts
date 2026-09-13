import { IdentityId } from '@memoflow/domain-shared';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanScheduleSchema,
  TaskReminderConfigSchema,
  type TaskPlanCompletionPolicyValue,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import { TaskPlan } from '../../../../domain/aggregates/task-plan';
import type { TaskPlanState } from '../../../../domain/aggregates/task-plan.state';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { TaskPlanStatus } from '../../../../domain/value-objects/task-plan-status';
import {
  ChecklistItemDefinition,
  TaskGoalBinding,
  TaskPlanSchedule,
  TaskReminderConfig,
} from '../../../../domain/value-objects';

export type PowerSyncTaskPlanRow = {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  status: string;
  outcome: string | null;
  completion_policy: string | null;
  closed_at: string | null;
  archived_at: string | null;
  abandoned_reason: string | null;
  importance: string;
  schedule: string;
  reminder_config: string | null;
  goal_id: string | null;
  key_result_id: string | null;
  goal_record_value: number | null;
  goal_progress_trigger: string | null;
  checklist: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class PowerSyncTaskPlanMapper {
  static toDomain(data: PowerSyncTaskPlanRow): TaskPlan {
    const schedule = TaskPlanSchedule.create(
      TaskPlanScheduleSchema.parse(JSON.parse(data.schedule)),
    );
    const reminderConfig = data.reminder_config
      ? TaskReminderConfig.fromDTO(TaskReminderConfigSchema.parse(JSON.parse(data.reminder_config)))
      : null;

    const state: TaskPlanState = {
      id: TaskPlanId.of(data.id),
      identityId: IdentityId.of(data.identity_id),
      title: data.name,
      description: data.description ?? null,
      schedule,
      reminderConfig,
      importance: data.importance as ImportanceLevel,
      status: (data.status as TaskPlanStatus) ?? TaskPlanStatus.Active,
      outcome: (data.outcome ?? TaskPlanOutcome.Open) as TaskPlanOutcomeValue,
      completionPolicy: (data.completion_policy ??
        TaskPlanCompletionPolicy.AllowCorrection) as TaskPlanCompletionPolicyValue,
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : null,
      archivedAt: data.archived_at ? new Date(data.archived_at).getTime() : null,
      abandonedReason: data.abandoned_reason ?? null,
      goalBinding:
        data.goal_id != null ||
        data.key_result_id != null ||
        data.goal_record_value != null ||
        data.goal_progress_trigger != null
          ? TaskGoalBinding.fromDTO({
              goalId: data.goal_id,
              keyResultId: data.key_result_id,
              contribution:
                data.goal_record_value != null && data.goal_progress_trigger != null
                  ? {
                      value: data.goal_record_value,
                      trigger: data.goal_progress_trigger as never,
                    }
                  : null,
            } as Parameters<typeof TaskGoalBinding.fromDTO>[0])
          : null,
      checklist: data.checklist
        ? (JSON.parse(data.checklist) as Array<{ id: string; title: string; order: number }>).map(
            (item) => ChecklistItemDefinition.of(item.title, item.order, item.id),
          )
        : [],
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : null,
      version: data.version ?? 1,
    };

    return TaskPlan.load(state);
  }

  static toPersistence(template: TaskPlan) {
    const dto = template.toServerDTO();
    return {
      id: String(dto.id),
      identityId: String(dto.identityId),
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status,
      outcome: dto.outcome,
      completionPolicy: dto.completionPolicy,
      closedAt: dto.closedAt != null ? new Date(dto.closedAt).toISOString() : null,
      archivedAt: dto.archivedAt != null ? new Date(dto.archivedAt).toISOString() : null,
      abandonedReason: dto.abandonedReason,
      importance: dto.importance,
      schedule: JSON.stringify(dto.schedule),
      reminderConfig: dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
      goalId: dto.goalBinding?.goalId ?? null,
      keyResultId: dto.goalBinding?.keyResultId ?? null,
      goalRecordValue: dto.goalBinding?.contribution?.value ?? null,
      goalProgressTrigger: dto.goalBinding?.contribution?.trigger ?? null,
      checklist: dto.checklist.length ? JSON.stringify(dto.checklist) : null,
      version: dto.version,
      createdAt: new Date(dto.createdAt).toISOString(),
      updatedAt: new Date(dto.updatedAt).toISOString(),
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).toISOString() : null,
    };
  }
}
