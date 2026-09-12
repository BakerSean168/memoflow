/** Task Module — Core vNext export projections. */
import type { ExportContext } from '../../portable-runtime';
import type { PortableTaskPlan, PortableTaskOccurrence } from '@memoflow/contracts/data-portability';
import type { TaskGoalBindingTrigger } from '@memoflow/contracts/task';
import { parseJsonField, toDateString, resolveExportRef, resolveExportRefOrThrow } from './projection-helpers';

export function projectTaskPlans(
  templates: unknown[],
  ctx: ExportContext,
): PortableTaskPlan[] {
  return templates.map((t) => {
    const entity = t as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('taskPlan');
    ctx.refToIdMap.set(String(entity.id), ref);
    const goalBinding = (entity.goalBinding as Record<string, unknown> | null | undefined) ?? null;
    const goalId = String(goalBinding?.goalId ?? entity.goalId ?? '');
    const keyResultId = String(goalBinding?.keyResultId ?? entity.keyResultId ?? '');
    const goalRef = goalId ? resolveExportRef(goalId, ctx, 'task') : null;
    const keyResultRef = keyResultId ? resolveExportRef(keyResultId, ctx, 'task') : null;
    const hasPortableBinding = goalRef != null && keyResultRef != null;
    const semanticContribution =
      goalBinding?.contribution && typeof goalBinding.contribution === 'object'
        ? (goalBinding.contribution as Record<string, unknown>)
        : null;
    const physicalContribution =
      entity.goalRecordValue != null && entity.goalProgressTrigger != null
        ? {
            value: Number(entity.goalRecordValue),
            trigger: entity.goalProgressTrigger as TaskGoalBindingTrigger,
          }
        : null;
    const contribution = semanticContribution
      ? {
          value: Number(semanticContribution.value),
          trigger: semanticContribution.trigger as TaskGoalBindingTrigger,
        }
      : physicalContribution;
    const flattenedRecurrence = entity.recurrenceRuleType
      ? {
          type: String(entity.recurrenceRuleType),
          interval: entity.recurrenceRuleInterval == null ? 1 : Number(entity.recurrenceRuleInterval),
          daysOfWeek: parseJsonField(entity.recurrenceRuleDaysOfWeek, []),
          endDate: entity.recurrenceRuleEndDate ?? null,
          count: entity.recurrenceRuleCount ?? null,
        }
      : null;
    const recurrenceRule = parseJsonField(entity.recurrenceRule, flattenedRecurrence) ?? flattenedRecurrence;
    const flattenedTimeConfig = entity.timeConfigType
      ? {
          type: String(entity.timeConfigType),
          startTime: entity.timeConfigStartTime ?? null,
          endTime: entity.timeConfigEndTime ?? null,
          durationMinutes: entity.timeConfigDurationMinutes ?? null,
          timePoint: entity.timeConfigTimePoint ?? null,
          timeRangeStart: entity.timeConfigTimeRangeStart ?? null,
          timeRangeEnd: entity.timeConfigTimeRangeEnd ?? null,
        }
      : {};
    const flattenedReminder = entity.reminderConfigEnabled == null
      ? null
      : {
          enabled: Boolean(entity.reminderConfigEnabled),
          triggers: entity.reminderConfigTimeOffsetMinutes == null
            ? []
            : [{
                relativeValue: Number(entity.reminderConfigTimeOffsetMinutes),
                relativeUnit: String(entity.reminderConfigUnit ?? 'Minute'),
                channel: entity.reminderConfigChannel ?? undefined,
              }],
        };

    return {
      _ref: ref,
      title: String(entity.name ?? entity.title ?? ''),
      description: entity.description as string | null | undefined,
      taskType: String(entity.taskType ?? (recurrenceRule ? 'Recurring' : 'OneTime')),
      importance: String(entity.importance ?? 'moderate'),
      tags: Array.isArray(entity.tags)
        ? entity.tags.map(String)
        : ((parseJsonField(entity.tags, []) as unknown[]) ?? []).map(String),
      color: entity.color as string | null | undefined,
      status: String(entity.status ?? 'Active'),
      outcome: String(entity.outcome ?? 'Open'),
      completionPolicy: String(entity.completionPolicy ?? 'AllowCorrection'),
      closedAt: toDateString(entity.closedAt),
      archivedAt: toDateString(entity.archivedAt),
      abandonedReason: entity.abandonedReason as string | null | undefined,
      goalRef: hasPortableBinding ? goalRef : null,
      keyResultRef: hasPortableBinding ? keyResultRef : null,
      contribution: hasPortableBinding ? contribution : null,
      checklist: Array.isArray(entity.checklist)
        ? entity.checklist
        : ((parseJsonField(entity.checklist, []) as unknown[]) ?? []),
      timeConfig: parseJsonField(entity.timeConfig, flattenedTimeConfig) ?? flattenedTimeConfig,
      recurrenceRule: recurrenceRule ?? null,
      reminderConfig: parseJsonField(entity.reminderConfig, flattenedReminder) ?? flattenedReminder,
      lastGeneratedDate: toDateString(entity.lastGeneratedDate),
      generateAheadDays: entity.generateAheadDays == null ? null : Number(entity.generateAheadDays),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}

export function projectTaskOccurrences(
  instances: unknown[],
  ctx: ExportContext,
): PortableTaskOccurrence[] {
  return instances.map((i) => {
    const entity = i as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('taskOccurrence');
    ctx.refToIdMap.set(String(entity.id), ref);
    return {
      _ref: ref,
      templateRef: resolveExportRefOrThrow(String(entity.templateId), ctx, 'task'),
      instanceDate: toDateString(entity.instanceDate) ?? new Date(0).toISOString(),
      occurrenceKey: entity.occurrenceKey as string | null | undefined,
      timeConfig: parseJsonField(entity.timeConfig, {}) ?? {},
      importance: String(entity.importance ?? 'moderate'),
      status: String(entity.status ?? 'Pending'),
      actualStartTime: toDateString(entity.actualStartTime),
      actualEndTime: toDateString(entity.actualEndTime),
      note: (entity.comment ?? entity.note) as string | null | undefined,
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
