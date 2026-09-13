/** Task Module — Core vNext export projections. */
import type { ExportContext } from '../../portable-runtime';
import type {
  PortableTaskPlan,
  PortableTaskOccurrence,
} from '@memoflow/contracts/data-portability';
import {
  TaskOccurrenceChecklistItemSchema,
  TaskOccurrenceResultSchema,
  TaskOccurrenceScheduleSnapshotSchema,
  TaskPlanScheduleSchema,
  TaskReminderConfigSchema,
  type TaskGoalBindingTrigger,
} from '@memoflow/contracts/task';
import {
  parseJsonField,
  toDateString,
  resolveExportRef,
  resolveExportRefOrThrow,
} from './projection-helpers';

export function projectTaskPlans(templates: unknown[], ctx: ExportContext): PortableTaskPlan[] {
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
    const semanticSchedule = entity.schedule as
      { toDTO?: () => unknown } | Record<string, unknown> | string | undefined;
    const scheduleCandidate =
      semanticSchedule &&
      typeof semanticSchedule === 'object' &&
      typeof semanticSchedule.toDTO === 'function'
        ? semanticSchedule.toDTO()
        : parseJsonField(semanticSchedule, semanticSchedule);
    const schedule = TaskPlanScheduleSchema.parse(scheduleCandidate);

    const semanticReminder = entity.reminderConfig as
      { toDTO?: () => unknown } | Record<string, unknown> | string | null | undefined;
    const reminderCandidate =
      semanticReminder &&
      typeof semanticReminder === 'object' &&
      typeof semanticReminder.toDTO === 'function'
        ? semanticReminder.toDTO()
        : parseJsonField(semanticReminder, semanticReminder);
    const reminderConfig =
      reminderCandidate == null ? null : TaskReminderConfigSchema.parse(reminderCandidate);

    return {
      _ref: ref,
      title: String(entity.name ?? entity.title ?? ''),
      description: entity.description as string | null | undefined,
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
      checklist: (Array.isArray(entity.checklist)
        ? entity.checklist
        : ((parseJsonField(entity.checklist, []) as unknown[]) ?? [])
      ).map((item) => {
        const value = item as { toDTO?: () => unknown } | Record<string, unknown>;
        const definition =
          value && typeof value === 'object' && typeof value.toDTO === 'function'
            ? (value.toDTO() as Record<string, unknown>)
            : (value as Record<string, unknown>);
        const definitionId = String(definition.id ?? '');
        if (!definitionId) {
          throw new Error('EXPORT_VALIDATION_ERROR: Task checklist definition is missing identity');
        }
        const definitionRef = ctx.refAllocator.allocate('taskChecklistDefinition');
        ctx.refToIdMap.set(definitionId, definitionRef);
        return {
          _ref: definitionRef,
          title: String(definition.title ?? ''),
          order: Number(definition.order ?? 0),
        };
      }),
      schedule,
      reminderConfig,
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

    const semanticSnapshot = entity.scheduleSnapshot as
      { toDTO?: () => unknown } | Record<string, unknown> | undefined;
    const scheduleSnapshot = TaskOccurrenceScheduleSnapshotSchema.parse(
      semanticSnapshot &&
        typeof semanticSnapshot === 'object' &&
        typeof semanticSnapshot.toDTO === 'function'
        ? semanticSnapshot.toDTO()
        : {
            date: entity.scheduleDate,
            timing: parseJsonField(entity.scheduleTiming),
          },
    );
    const result =
      entity.result == null
        ? null
        : TaskOccurrenceResultSchema.parse(parseJsonField(entity.result));
    const checklistState = TaskOccurrenceChecklistItemSchema.array()
      .parse(parseJsonField(entity.checklistState, []))
      .map((item) => ({
        definitionRef: resolveExportRefOrThrow(item.definitionId, ctx, 'task checklist definition'),
        titleSnapshot: item.titleSnapshot,
        orderSnapshot: item.orderSnapshot,
        completed: item.completed,
        completedAt: item.completedAt,
      }));

    return {
      _ref: ref,
      planRef: resolveExportRefOrThrow(String(entity.planId), ctx, 'task'),
      scheduleSnapshot,
      importanceSnapshot: String(entity.importanceSnapshot),
      status: String(entity.status ?? 'Pending'),
      actualStartAt: toDateString(entity.actualStartAt) ?? null,
      result,
      checklistState,
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
