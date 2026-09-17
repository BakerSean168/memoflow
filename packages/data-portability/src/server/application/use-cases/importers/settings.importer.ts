/**
 * Settings module importer — handles singletons: settings, notification preference, reminder preference.
 */

import { newId } from '@memoflow/utils';
import type { ImportContext } from '../../portable-runtime';
import type { PortableSettings, PortableNotificationPreference } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { jsonStringify, incSingleton } from './import-helpers';

export async function importSettings(
  tx: TxClient, ctx: ImportContext, settings: PortableSettings | undefined,
): Promise<void> {
  if (!settings) return;
  await tx.upsertUserPreferences({
    identityId: ctx.identityId,
    presentation: settings.preferences.presentation,
    regional: settings.preferences.regional,
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
  });
  incSingleton(ctx, 'notificationPreference');
}
