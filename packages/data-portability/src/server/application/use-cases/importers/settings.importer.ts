/**
 * Settings module importer — handles singletons: settings, notification preference, reminder preference.
 */

import { newId } from '@memoflow/utils';
import type { ImportContext } from '../../portable-runtime';
import type { PortableSettings, PortableNotificationPreference, PortableUserReminderPreference } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { jsonStringify, incSingleton } from './import-helpers';

export async function importSettings(
  tx: TxClient, ctx: ImportContext, settings: PortableSettings | undefined,
): Promise<void> {
  if (!settings) return;
  const prefs = settings.preferences ?? {};
  await tx.upsertUserSetting({
    identityId: ctx.identityId,
    preferences: prefs as Record<string, unknown>,
  });
  incSingleton(ctx, 'settings');
}

export async function importNotificationPreference(
  tx: TxClient, ctx: ImportContext, pref: PortableNotificationPreference | undefined,
): Promise<void> {
  if (!pref) return;
  await tx.upsertNotificationPreference({
    id: newId(),
    identityId: ctx.identityId,
    globalChannels: jsonStringify(pref.globalChannels ?? {}),
    workflowOverrides: jsonStringify(pref.workflowOverrides ?? {}),
    doNotDisturb: pref.doNotDisturb ? jsonStringify(pref.doNotDisturb) : null,
    rateLimit: pref.rateLimit ? jsonStringify(pref.rateLimit) : null,
  });
  incSingleton(ctx, 'notificationPreference');
}

export async function importUserReminderPreference(
  tx: TxClient, ctx: ImportContext, pref: PortableUserReminderPreference | undefined,
): Promise<void> {
  if (!pref) return;
  await tx.upsertUserReminderPreference({
    id: newId(),
    identityId: ctx.identityId,
    bestTimeSlots: jsonStringify(pref.bestTimeSlots ?? []),
    worstTimeSlots: jsonStringify(pref.worstTimeSlots ?? []),
    globalReminderEnabled: pref.globalReminderEnabled ?? true,
  });
  incSingleton(ctx, 'userReminderPreference');
}
