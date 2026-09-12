/** Task vNext importer — plans and occurrences only; no Folder/DAG surface. */
import type { ImportContext } from '../../portable-runtime';
import type { PortableTaskData } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { allocateId, resolveRef, optRef, jsonStringify, inc, rec, timestamps } from './import-helpers';

export async function importTasks(tx: TxClient, ctx: ImportContext, data: PortableTaskData): Promise<void> {
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
      timeConfigStartTime: tc.startTime ? String(tc.startTime) : (tc.startDate ? String(tc.startDate) : null),
      timeConfigEndTime: tc.endTime ? String(tc.endTime) : null,
      timeConfigDurationMinutes: tc.durationMinutes == null ? null : Number(tc.durationMinutes),
      timeConfigTimePoint: tc.timePoint == null ? null : Number(tc.timePoint),
      timeConfigTimeRangeStart: tc.timeRangeStart == null ? ((tc.timeRange as Record<string, unknown> | undefined)?.start as number | null | undefined) ?? null : Number(tc.timeRangeStart),
      timeConfigTimeRangeEnd: tc.timeRangeEnd == null ? ((tc.timeRange as Record<string, unknown> | undefined)?.end as number | null | undefined) ?? null : Number(tc.timeRangeEnd),
      recurrenceRuleType: rr ? String(rr.type ?? rr.frequency ?? '') || null : null,
      recurrenceRuleInterval: rr?.interval == null ? null : Number(rr.interval),
      recurrenceRuleDaysOfWeek: rr?.daysOfWeek ? jsonStringify(rr.daysOfWeek) : null,
      recurrenceRuleEndDate: rr?.endDate ? String(rr.endDate) : null,
      recurrenceRuleCount: rr?.count == null ? (rr?.occurrences == null ? null : Number(rr.occurrences)) : Number(rr.count),
      reminderConfigEnabled: rc?.enabled == null ? null : Boolean(rc.enabled),
      reminderConfigTimeOffsetMinutes: rc?.timeOffsetMinutes == null ? (reminderTrigger?.relativeValue == null ? null : Number(reminderTrigger.relativeValue)) : Number(rc.timeOffsetMinutes),
      reminderConfigUnit: (rc?.unit as string | undefined) ?? (reminderTrigger?.relativeUnit as string | undefined) ?? null,
      reminderConfigChannel: (rc?.channel as string | undefined) ?? (reminderTrigger?.channel as string | undefined) ?? null,
      lastGeneratedDate: t.lastGeneratedDate ? String(t.lastGeneratedDate) : null,
      generateAheadDays: t.generateAheadDays == null ? null : Number(t.generateAheadDays),
      goalId: optRef(t.goalRef as string | null, ctx),
      keyResultId: optRef(t.keyResultRef as string | null, ctx),
      goalRecordValue: contribution?.value == null ? null : Number(contribution.value),
      goalProgressTrigger: (contribution?.trigger as string | null | undefined) ?? null,
      checklist: t.checklist ? jsonStringify(t.checklist) : null,
      ...timestamps(t),
    });
    inc(ctx, 'taskPlans');
  }

  for (const instance of data.instances) {
    const i = rec(instance);
    const templateId = resolveRef(i.templateRef as string, ctx);
    const portableOccurrenceKey = (i.occurrenceKey as string | null | undefined) ?? null;
    const occurrenceKey = portableOccurrenceKey
      ? `${templateId}:${portableOccurrenceKey.split(':').slice(1).join(':')}`
      : null;
    await tx.createTaskOccurrence({
      id: allocateId(ctx, i._ref as string),
      templateId,
      identityId: ctx.identityId,
      instanceDate: String(i.instanceDate),
      occurrenceKey,
      status: String(i.status ?? 'Pending'),
      importance: String(i.importance ?? 'moderate'),
      timeConfig: jsonStringify(i.timeConfig ?? {}),
      actualStartTime: i.actualStartTime ? String(i.actualStartTime) : null,
      actualEndTime: i.actualEndTime ? String(i.actualEndTime) : null,
      comment: (i.note as string | null | undefined) ?? null,
      ...timestamps(i),
    });
    inc(ctx, 'taskOccurrences');
  }
}
