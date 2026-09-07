/**
 * Reminder module importer — handles groups, templates, and responses.
 */

import type { ImportContext } from '../../portable-runtime';
import type { PortableReminderData } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { allocateId, resolveRef, jsonStringify, inc, rec, timestamps } from './import-helpers';

export async function importReminders(
  tx: TxClient,
  ctx: ImportContext,
  data: PortableReminderData,
): Promise<void> {
  for (const group of data.groups) {
    const g = rec(group);
    const id = allocateId(ctx, g._ref as string);
    await tx.createReminderGroup({
      id,
      identityId: ctx.identityId,
      name: g.name as string,
      description: (g.description as string | null) ?? null,
      color: (g.color as string | null) ?? null,
      icon: (g.icon as string | null) ?? null,
      enabled: (g.enabled as boolean) ?? true,
      status: (g.status as string) ?? 'active',
      order: (g.order as number) ?? 0,
      stats: jsonStringify({}),
      ...timestamps(g),
    });
    inc(ctx, 'reminderGroups');
  }

  for (const template of data.templates) {
    const t = rec(template);
    const id = allocateId(ctx, t._ref as string);
    const routineDefinition = (t.routineDefinition as Record<string, unknown> | undefined) ?? {};
    await tx.createReminderTemplate({
      id,
      identityId: ctx.identityId,
      name: t.title as string,
      description: (t.description as string | null) ?? null,
      type: t.type as string,
      selfEnabled: (t.selfEnabled as boolean) ?? true,
      status: (t.status as string) ?? 'active',
      routineEnabled: (routineDefinition.enabled as boolean) ?? (t.selfEnabled as boolean) ?? true,
      routineTrigger: routineDefinition.trigger ?? null,
      profileMemberships: (
        (t.profileMemberships as Array<Record<string, unknown>> | undefined) ?? []
      ).map((membership) => ({
        profileId: resolveRef(membership.profileRef as string, ctx),
        enabled: (membership.enabled as boolean) ?? true,
      })),
      importanceLevel: (t.importanceLevel as string) ?? 'moderate',
      tags: jsonStringify(t.tags ?? []),
      color: (t.color as string | null) ?? null,
      icon: (t.icon as string | null) ?? null,
      trigger: jsonStringify(t.trigger ?? {}),
      activeTime: jsonStringify(t.activeTime ?? {}),
      activeHours: t.activeHours ? jsonStringify(t.activeHours) : null,
      notificationConfig: jsonStringify(t.notificationConfig ?? {}),
      stats: jsonStringify({}),
      ...timestamps(t),
    });
    inc(ctx, 'reminderTemplates');
  }

  for (const response of data.responses) {
    const r = rec(response);
    const id = allocateId(ctx, r._ref as string);
    await tx.createReminderResponse({
      id,
      identityId: ctx.identityId,
      templateId: resolveRef(r.templateRef as string, ctx),
      action: r.action as string,
      responseTime: typeof r.responseTime === 'number' ? r.responseTime : null,
      snoozeDurationSeconds:
        typeof r.snoozeDurationSeconds === 'number' ? r.snoozeDurationSeconds : null,
      timestamp: String(r.timestamp),
    });
    inc(ctx, 'reminderResponses');
  }
}
