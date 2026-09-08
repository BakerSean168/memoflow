/**
 * Prisma TaskTemplate Mapper
 *
 * Maps between TaskTemplate domain aggregate and Prisma model.
 * Reconstructs value objects from normalized persistence columns.
 */

import type { TaskTemplate as PrismaTaskTemplate } from '@memoflow/database';
import { toDateOrNull } from '@memoflow/utils/shared';
import { TaskTemplate } from '../../../../domain/aggregates/task-template';
import {
  RecurrenceFrequency,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  type TaskPlanCompletionPolicyValue,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import { TaskType } from '@memoflow/contracts/task';
import type { TaskTimeType } from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { ReminderTimeUnit } from '@memoflow/contracts/task';
import { TaskTemplateId } from '../../../../domain/value-objects/task-template-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskTemplateStatus } from '../../../../domain/value-objects/task-template-status';
import {
  TaskTimeConfig,
  RecurrenceRule,
  TaskReminderConfig,
  TaskGoalBinding,
  ChecklistItemDefinition,
} from '../../../../domain/value-objects';

type PrismaTaskTemplateVNext = PrismaTaskTemplate & {
  outcome?: string;
  completionPolicy?: string;
  closedAt?: Date | null;
  archivedAt?: Date | null;
  abandonedReason?: string | null;
};

/** Prisma Date/DateTime → Instant (epoch ms). Required fields never null. */
function requiredInstant(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (value == null) return Date.now();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

/** Prisma Date/DateTime → Instant | null. */
function optionalInstant(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export class PrismaTaskTemplateMapper {
  /**
   * Prisma record → TaskTemplate aggregate root
   */
  static toDomain(data: PrismaTaskTemplate): TaskTemplate {
    const vnext = data as PrismaTaskTemplateVNext;
    let timeConfig = null;
    if (data.timeConfigType) {
      timeConfig = TaskTimeConfig.create({
        timeType: data.timeConfigType as TaskTimeType,
        startDate: data.timeConfigStartTime ? data.timeConfigStartTime.getTime() : null,
        timePoint: data.timeConfigTimePoint ?? null,
        timeRange:
          data.timeConfigTimeRangeStart != null && data.timeConfigTimeRangeEnd != null
            ? { start: data.timeConfigTimeRangeStart, end: data.timeConfigTimeRangeEnd }
            : null,
      });
    }

    let recurrenceRule = null;
    if (data.recurrenceRuleType) {
      recurrenceRule = RecurrenceRule.create({
        frequency: data.recurrenceRuleType as RecurrenceFrequency,
        interval: data.recurrenceRuleInterval ?? 1,
        daysOfWeek: data.recurrenceRuleDaysOfWeek ? JSON.parse(data.recurrenceRuleDaysOfWeek) : [],
        endDate: data.recurrenceRuleEndDate ? data.recurrenceRuleEndDate.getTime() : null,
        occurrences: data.recurrenceRuleCount,
      });
    }

    let reminderConfig = null;
    if (data.reminderConfigEnabled) {
      const triggers = [
        {
          type: 'Relative' as const,
          absoluteTime: null,
          relativeValue: data.reminderConfigTimeOffsetMinutes,
          relativeUnit: data.reminderConfigUnit as ReminderTimeUnit,
        },
      ];
      reminderConfig = TaskReminderConfig.create({
        enabled: data.reminderConfigEnabled,
        triggers,
      });
    }

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
      ? (JSON.parse(data.checklist) as Array<{ id?: string; title: string; order: number }>).map(
          (item) =>
            ChecklistItemDefinition.of(
              item.title,
              item.order,
              item.id ?? `legacy-checklist-${item.order}`,
            ),
        )
      : [];

    return TaskTemplate.load({
      id: TaskTemplateId.of(data.id),
      identityId: IdentityId.of(data.identityId),
      title: data.name,
      description: data.description,
      taskType: recurrenceRule ? TaskType.Recurring : TaskType.OneTime,
      timeConfig,
      recurrenceRule,
      reminderConfig,
      importance: data.importance as ImportanceLevel,
      goalBinding,
      checklist,
      status: data.status as TaskTemplateStatus,
      outcome: (vnext.outcome ?? TaskPlanOutcome.Open) as TaskPlanOutcomeValue,
      completionPolicy: (vnext.completionPolicy ??
        TaskPlanCompletionPolicy.AllowCorrection) as TaskPlanCompletionPolicyValue,
      closedAt: optionalInstant(vnext.closedAt),
      archivedAt: optionalInstant(vnext.archivedAt),
      abandonedReason: vnext.abandonedReason ?? null,
      lastGeneratedDate: optionalInstant(data.lastGeneratedDate),
      generateAheadDays: data.generateAheadDays,
      startDate: null,
      dueDate: null,
      completedAt: null,
      estimatedMinutes: null,
      actualMinutes: null,
      note: null,
      version: data.version,
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
      deletedAt: optionalInstant(data.deletedAt),
    });
  }

  /**
   * TaskTemplate 聚合根 → Prisma write data
   */
  static toPersistence(template: TaskTemplate) {
    const dto = template.toServerDTO();
    // Flatten nested timeConfig
    const timeConfigType = dto.timeConfig?.timeType ?? null;
    const timeConfigStartTime = toDateOrNull(dto.timeConfig?.startDate);
    const timeConfigEndTime = null;
    const timeConfigTimePoint = dto.timeConfig?.timePoint ?? null;
    const timeConfigTimeRangeStart = dto.timeConfig?.timeRange?.start ?? null;
    const timeConfigTimeRangeEnd = dto.timeConfig?.timeRange?.end ?? null;
    const timeConfigDurationMinutes =
      timeConfigTimeRangeEnd != null && timeConfigTimeRangeStart != null
        ? timeConfigTimeRangeEnd - timeConfigTimeRangeStart
        : null;

    // Flatten nested recurrenceRule
    const recurrenceRuleType = dto.recurrenceRule?.frequency ?? null;
    const recurrenceRuleInterval = dto.recurrenceRule?.interval ?? null;
    const recurrenceRuleDaysOfWeek = dto.recurrenceRule?.daysOfWeek
      ? JSON.stringify(dto.recurrenceRule.daysOfWeek)
      : null;
    const recurrenceRuleEndDate = toDateOrNull(dto.recurrenceRule?.endDate);
    const recurrenceRuleCount = dto.recurrenceRule?.occurrences ?? null;

    // Flatten nested reminderConfig
    const reminderConfigEnabled = dto.reminderConfig?.enabled ?? null;
    const reminderConfigTimeOffsetMinutes =
      dto.reminderConfig?.triggers?.[0]?.relativeValue ?? null;
    const reminderConfigUnit = dto.reminderConfig?.triggers?.[0]?.relativeUnit ?? null;
    const reminderConfigChannel = dto.reminderConfig ? 'PUSH' : null;

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
      timeConfigType,
      timeConfigStartTime,
      timeConfigEndTime,
      timeConfigDurationMinutes,
      timeConfigTimePoint,
      timeConfigTimeRangeStart,
      timeConfigTimeRangeEnd,
      recurrenceRuleType,
      recurrenceRuleInterval,
      recurrenceRuleDaysOfWeek,
      recurrenceRuleEndDate,
      recurrenceRuleCount,
      reminderConfigEnabled,
      reminderConfigTimeOffsetMinutes,
      reminderConfigUnit,
      reminderConfigChannel,
      lastGeneratedDate: toDateOrNull(dto.lastGeneratedDate),
      generateAheadDays: dto.generateAheadDays,
      goalId: dto.goalBinding?.goalId ?? null,
      keyResultId: dto.goalBinding?.keyResultId ?? null,
      goalRecordValue: dto.goalBinding?.contribution?.value ?? null,
      goalProgressTrigger: dto.goalBinding?.contribution?.trigger ?? null,
      checklist: dto.checklist?.length ? JSON.stringify(dto.checklist) : null,
      version: dto.version,
      deletedAt: toDateOrNull(dto.deletedAt),
    };
  }

  /**
   * Batch conversion: Prisma → Domain
   */
  static toDomainList(rows: PrismaTaskTemplate[]): TaskTemplate[] {
    return rows.map((row) => PrismaTaskTemplateMapper.toDomain(row));
  }
}
