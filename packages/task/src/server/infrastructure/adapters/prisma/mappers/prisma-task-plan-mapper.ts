/**
 * Prisma TaskPlan Mapper
 *
 * Maps between TaskPlan domain aggregate and Prisma model.
 * Reconstructs value objects from normalized persistence columns.
 */

import type { TaskPlan as PrismaTaskPlan } from '@memoflow/database';
import { toDateOrNull } from '@memoflow/utils/shared';
import { TaskPlan } from '../../../../domain/aggregates/task-plan';
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
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';
import { TaskPlanStatus } from '../../../../domain/value-objects/task-plan-status';
import {
  TaskTimeConfig,
  RecurrenceRule,
  TaskReminderConfig,
  TaskGoalBinding,
  ChecklistItemDefinition,
  TaskPlanSchedule,
} from '../../../../domain/value-objects';

const PERSISTED_DATE_ONLY_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });

type PrismaTaskPlanVNext = PrismaTaskPlan & {
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

export class PrismaTaskPlanMapper {
  /**
   * Prisma record → TaskPlan aggregate root
   */
  static toDomain(data: PrismaTaskPlan): TaskPlan {
    const vnext = data as PrismaTaskPlanVNext;
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

    return TaskPlan.load({
      id: TaskPlanId.of(data.id),
      identityId: IdentityId.of(data.identityId),
      title: data.name,
      description: data.description,
      schedule: TaskPlanSchedule.fromLegacy(
        recurrenceRule ? TaskType.Recurring : TaskType.OneTime,
        timeConfig,
        recurrenceRule,
        PERSISTED_DATE_ONLY_CONTEXT,
      ),
      reminderConfig,
      importance: data.importance as ImportanceLevel,
      goalBinding,
      checklist,
      status: data.status as TaskPlanStatus,
      outcome: (vnext.outcome ?? TaskPlanOutcome.Open) as TaskPlanOutcomeValue,
      completionPolicy: (vnext.completionPolicy ??
        TaskPlanCompletionPolicy.AllowCorrection) as TaskPlanCompletionPolicyValue,
      closedAt: optionalInstant(vnext.closedAt),
      archivedAt: optionalInstant(vnext.archivedAt),
      abandonedReason: vnext.abandonedReason ?? null,
      lastGeneratedDate: optionalInstant(data.lastGeneratedDate),
      generateAheadDays: data.generateAheadDays,
      version: data.version,
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
      deletedAt: optionalInstant(data.deletedAt),
    });
  }

  /**
   * TaskPlan 聚合根 → Prisma write data
   */
  static toPersistence(template: TaskPlan) {
    const dto = template.toServerDTO();
    // Transitional old-column writer derived from canonical TaskPlan.schedule.
    const timeConfig = template.schedule.toLegacyTimeConfig(PERSISTED_DATE_ONLY_CONTEXT);
    const recurrenceRule = template.schedule.toLegacyRecurrenceRule(PERSISTED_DATE_ONLY_CONTEXT);
    const timeConfigType = timeConfig.timeType;
    const timeConfigStartTime = toDateOrNull(timeConfig.startDate);
    const timeConfigEndTime = null;
    const timeConfigTimePoint = timeConfig.timePoint ?? null;
    const timeConfigTimeRangeStart = timeConfig.timeRange?.start ?? null;
    const timeConfigTimeRangeEnd = timeConfig.timeRange?.end ?? null;
    const timeConfigDurationMinutes =
      timeConfigTimeRangeEnd != null && timeConfigTimeRangeStart != null
        ? timeConfigTimeRangeEnd - timeConfigTimeRangeStart
        : null;

    // Flatten nested recurrenceRule
    const recurrenceRuleType = recurrenceRule?.frequency ?? null;
    const recurrenceRuleInterval = recurrenceRule?.interval ?? null;
    const recurrenceRuleDaysOfWeek = recurrenceRule
      ? JSON.stringify(recurrenceRule.daysOfWeek)
      : null;
    const recurrenceRuleEndDate = toDateOrNull(recurrenceRule?.endDate);
    const recurrenceRuleCount = recurrenceRule?.occurrences ?? null;

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
  static toDomainList(rows: PrismaTaskPlan[]): TaskPlan[] {
    return rows.map((row) => PrismaTaskPlanMapper.toDomain(row));
  }
}
