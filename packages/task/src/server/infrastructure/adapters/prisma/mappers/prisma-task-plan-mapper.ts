/** Prisma TaskPlan mapper for the canonical vNext persistence shape. */

import type { TaskPlan as PrismaTaskPlan } from '@memoflow/database';
import { toDateOrNull } from '@memoflow/utils/shared';
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
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { TaskPlanStatus } from '../../../../domain/value-objects/task-plan-status';
import {
  ChecklistItemDefinition,
  TaskGoalBinding,
  TaskPlanSchedule,
  TaskReminderConfig,
} from '../../../../domain/value-objects';

/** Prisma Date/DateTime -> Instant (epoch ms). Required fields never null. */
function requiredInstant(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (value == null) return Date.now();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

/** Prisma Date/DateTime -> Instant | null. */
function optionalInstant(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export class PrismaTaskPlanMapper {
  static toDomain(data: PrismaTaskPlan): TaskPlan {
    const schedule = TaskPlanSchedule.create(TaskPlanScheduleSchema.parse(data.schedule));
    const reminderConfig = data.reminderConfig
      ? TaskReminderConfig.fromDTO(TaskReminderConfigSchema.parse(JSON.parse(data.reminderConfig)))
      : null;

    const hasGoalBinding =
      data.goalId != null ||
      data.keyResultId != null ||
      data.goalRecordValue != null ||
      data.goalProgressTrigger != null;
    const goalBinding = hasGoalBinding
      ? TaskGoalBinding.fromDTO({
          goalId: data.goalId,
          keyResultId: data.keyResultId,
          contribution:
            data.goalRecordValue != null && data.goalProgressTrigger != null
              ? {
                  value: data.goalRecordValue,
                  trigger: data.goalProgressTrigger as never,
                }
              : null,
        } as Parameters<typeof TaskGoalBinding.fromDTO>[0])
      : null;

    const checklist = data.checklist
      ? (JSON.parse(data.checklist) as Array<{ id: string; title: string; order: number }>).map(
          (item) => ChecklistItemDefinition.of(item.title, item.order, item.id),
        )
      : [];

    return TaskPlan.load({
      id: TaskPlanId.of(data.id),
      identityId: IdentityId.of(data.identityId),
      title: data.name,
      description: data.description,
      schedule,
      reminderConfig,
      importance: data.importance as ImportanceLevel,
      goalBinding,
      checklist,
      status: data.status as TaskPlanStatus,
      outcome: (data.outcome ?? TaskPlanOutcome.Open) as TaskPlanOutcomeValue,
      completionPolicy: (data.completionPolicy ??
        TaskPlanCompletionPolicy.AllowCorrection) as TaskPlanCompletionPolicyValue,
      closedAt: optionalInstant(data.closedAt),
      archivedAt: optionalInstant(data.archivedAt),
      abandonedReason: data.abandonedReason ?? null,
      version: data.version,
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
      deletedAt: optionalInstant(data.deletedAt),
    });
  }

  static toPersistence(template: TaskPlan) {
    const dto = template.toServerDTO();
    return {
      identityId: dto.identityId,
      name: dto.name,
      description: dto.description,
      status: dto.status,
      outcome: dto.outcome,
      completionPolicy: dto.completionPolicy,
      closedAt: toDateOrNull(dto.closedAt),
      archivedAt: toDateOrNull(dto.archivedAt),
      abandonedReason: dto.abandonedReason,
      importance: dto.importance,
      schedule: dto.schedule,
      reminderConfig: dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
      goalId: dto.goalBinding?.goalId ?? null,
      keyResultId: dto.goalBinding?.keyResultId ?? null,
      goalRecordValue: dto.goalBinding?.contribution?.value ?? null,
      goalProgressTrigger: dto.goalBinding?.contribution?.trigger ?? null,
      checklist: dto.checklist.length ? JSON.stringify(dto.checklist) : null,
      version: dto.version,
      deletedAt: toDateOrNull(dto.deletedAt),
    };
  }

  static toDomainList(rows: PrismaTaskPlan[]): TaskPlan[] {
    return rows.map((row) => PrismaTaskPlanMapper.toDomain(row));
  }
}
