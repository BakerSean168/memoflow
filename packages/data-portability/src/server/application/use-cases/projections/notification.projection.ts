/** Notification Preference V2 export projection. */
import type { PortableNotificationPreference } from '@memoflow/contracts/data-portability';
import { parseJsonField } from './projection-helpers';

export function projectNotificationPreference(pref: unknown): PortableNotificationPreference {
  const entity = pref as Record<string, unknown>;
  return {
    globalChannels: (parseJsonField(entity.globalChannels, {}) ?? {}) as Record<string, boolean>,
    workflowOverrides: (parseJsonField(entity.workflowOverrides, {}) ?? {}) as Record<
      string,
      Record<string, boolean>
    >,
  };
}
