/** Task vNext importer — plans and occurrences only; no Folder/DAG surface. */
import type { ImportContext } from '../../portable-runtime';
import type { PortableTaskData } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import {
  allocateId,
  resolveRef,
  optRef,
  jsonStringify,
  inc,
  rec,
  timestamps,
} from './import-helpers';

export async function importTasks(
  tx: TxClient,
  ctx: ImportContext,
  data: PortableTaskData,
): Promise<void> {
  for (const template of data.templates) {
    const t = rec(template);
    const tc = (t.timeConfig as Record<string, unknown> | undefined) ?? {};
    const rr = (t.recurrenceRule as Record<string, unknown> | null | undefined) ?? null;
    const rc = (t.reminderConfig as Record<string, unknown> | null | undefined) ?? null;
    const reminderTrigger = Array.isArray(rc?.triggers)
      ? (rc?.triggers[0] as Record<string, unknown> | undefined)
      : undefined;
    const contribution =
      t.contribution && typeof t.contribution === 'object'
        ? (t.contribution as Record<string, unknown>)
        : null;
    const checklist = Array.isArray(t.checklist)
      ? t.checklist.map((item) => {
          const definition = rec(item);
          return {
            id: allocateId(ctx, String(definition._ref)),
            title: String(definition.title),
            order: Number(definition.order),
          };
        })
      : [];
    await tx.createTaskPlan({
      id: allocateId(ctx, t._ref as string),
      identityId: ctx.identityId,
      name: String(t.title),
      description: (t.description as string | null | undefined) ?? null,
      status: String(t.status ?? 'Active'),
      outcome: String(t.outcome ?? 'Open'),
      completionPolicy: String(t.completionPolicy ?? 'AllowCorrection'),
      closedAt: t.closedAt ? String(t.closedAt) : null,
      archivedAt: t.archivedAt ? String(t.archivedAt) : null,
      abandonedReason: (t.abandonedReason as string | null | undefined) ?? null,
      importance: String(t.importance ?? 'moderate'),
      color: (t.color as string | null | undefined) ?? null,
      tags: jsonStringify(t.tags ?? []),
      timeConfigType: String(tc.type ?? tc.timeType ?? '') || null,
      timeConfigStartTime: tc.startTime
        ? String(tc.startTime)
        : tc.startDate
          ? String(tc.startDate)
          : null,
      timeConfigEndTime: tc.endTime ? String(tc.endTime) : null,
      timeConfigDurationMinutes: tc.durationMinutes == null ? null : Number(tc.durationMinutes),
      timeConfigTimePoint: tc.timePoint == null ? null : Number(tc.timePoint),
      timeConfigTimeRangeStart:
        tc.timeRangeStart == null
          ? (((tc.timeRange as Record<string, unknown> | undefined)?.start as
              number | null | undefined) ?? null)
          : Number(tc.timeRangeStart),
      timeConfigTimeRangeEnd:
        tc.timeRangeEnd == null
          ? (((tc.timeRange as Record<string, unknown> | undefined)?.end as
              number | null | undefined) ?? null)
          : Number(tc.timeRangeEnd),
      recurrenceRuleType: rr ? String(rr.type ?? rr.frequency ?? '') || null : null,
      recurrenceRuleInterval: rr?.interval == null ? null : Number(rr.interval),
      recurrenceRuleDaysOfWeek: rr?.daysOfWeek ? jsonStringify(rr.daysOfWeek) : null,
      recurrenceRuleEndDate: rr?.endDate ? String(rr.endDate) : null,
      recurrenceRuleCount:
        rr?.count == null
          ? rr?.occurrences == null
            ? null
            : Number(rr.occurrences)
          : Number(rr.count),
      reminderConfigEnabled: rc?.enabled == null ? null : Boolean(rc.enabled),
      reminderConfigTimeOffsetMinutes:
        rc?.timeOffsetMinutes == null
          ? reminderTrigger?.relativeValue == null
            ? null
            : Number(reminderTrigger.relativeValue)
          : Number(rc.timeOffsetMinutes),
      reminderConfigUnit:
        (rc?.unit as string | undefined) ??
        (reminderTrigger?.relativeUnit as string | undefined) ??
        null,
      reminderConfigChannel:
        (rc?.channel as string | undefined) ??
        (reminderTrigger?.channel as string | undefined) ??
        null,
      goalId: optRef(t.goalRef as string | null, ctx),
      keyResultId: optRef(t.keyResultRef as string | null, ctx),
      goalRecordValue: contribution?.value == null ? null : Number(contribution.value),
      goalProgressTrigger: (contribution?.trigger as string | null | undefined) ?? null,
      checklist: checklist.length > 0 ? jsonStringify(checklist) : null,
      ...timestamps(t),
    });
    inc(ctx, 'taskPlans');
  }

  for (const instance of data.instances) {
    const i = rec(instance);
    const planId = resolveRef(i.planRef as string, ctx);
    const scheduleSnapshot = rec(i.scheduleSnapshot);
    const scheduleDate = String(scheduleSnapshot.date);
    await tx.createTaskOccurrence({
      id: allocateId(ctx, i._ref as string),
      planId,
      identityId: ctx.identityId,
      occurrenceKey: `${planId}:${scheduleDate}`,
      scheduleDate,
      scheduleTiming: jsonStringify(scheduleSnapshot.timing),
      importanceSnapshot: String(i.importanceSnapshot ?? 'Moderate'),
      status: String(i.status ?? 'Pending'),
      actualStartAt: i.actualStartAt ? String(i.actualStartAt) : null,
      result: i.result == null ? null : jsonStringify(i.result),
      checklistState: jsonStringify(
        Array.isArray(i.checklistState)
          ? i.checklistState.map((item) => {
              const state = rec(item);
              return {
                definitionId: resolveRef(String(state.definitionRef), ctx),
                titleSnapshot: String(state.titleSnapshot),
                orderSnapshot: Number(state.orderSnapshot),
                completed: Boolean(state.completed),
                completedAt: state.completedAt == null ? null : Number(state.completedAt),
              };
            })
          : [],
      ),
      ...timestamps(i),
    });
    inc(ctx, 'taskOccurrences');
  }
}
