// Product boundary (architecture decision A): Desktop notifications are system-explicit
// (desktop durable worker), NOT user-configurable via preferences UI.
/**
 * useNotificationPreferences — residual 199
 *
 * Loads/updates NotificationPreference via NotificationClientPort.
 * Identity is never passed from the UI; transport auth stamps it server-side.
 */

import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { NOTIFICATION_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import type {
  NotificationChannelType,
  NotificationPreferenceClientDTO,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';

export const NOTIFICATION_PREFERENCE_MODULES = [
  'task',
  'goal',
  'schedule',
  'reminder',
  'account',
  'system',
] as const;

export type NotificationPreferenceModule = (typeof NOTIFICATION_PREFERENCE_MODULES)[number];

export type PreferenceChannelFlag = 'inApp' | 'push' | 'email';

const CHANNEL_FLAG_TO_TYPE: Record<PreferenceChannelFlag, NotificationChannelType> = {
  inApp: 'InApp',
  push: 'Push',
  email: 'Email',
};

function toPreferenceErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string,
): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return t(fallbackKey);
}

export function useNotificationPreferences() {
  const service = useStrictInject(NOTIFICATION_SERVICE_KEY, 'NotificationService');
  const { t } = useI18n();

  const preference = ref<NotificationPreferenceClientDTO | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  const settings = computed(() => preference.value?.workflowOverrides ?? {});

  function hasChannel(moduleName: string, flag: PreferenceChannelFlag): boolean {
    const type = CHANNEL_FLAG_TO_TYPE[flag];
    const workflowKey = `${moduleName}.general`;
    const workflowValue = preference.value?.workflowOverrides?.[workflowKey]?.[type];
    if (workflowValue !== undefined) return workflowValue;
    return preference.value?.globalChannels?.[type] ?? true;
  }

  function hasGlobalChannel(flag: PreferenceChannelFlag): boolean {
    return preference.value?.globalChannels?.[CHANNEL_FLAG_TO_TYPE[flag]] ?? true;
  }

  async function loadPreferences(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await service.getPreferences();
      if (result.ok) {
        preference.value = result.data;
      } else {
        error.value = toPreferenceErrorMessage(
          result.error,
          t,
          'setting.notifications.loadPreferencesFailed',
        );
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function updatePreferences(
    request: UpdateNotificationPreferenceReq,
  ): Promise<boolean> {
    isSaving.value = true;
    error.value = null;
    try {
      const result = await service.updatePreferences(request);
      if (result.ok) {
        preference.value = result.data;
        return true;
      }
      error.value = toPreferenceErrorMessage(
        result.error,
        t,
        'setting.notifications.updatePreferencesFailed',
      );
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  async function setModuleChannel(
    moduleName: NotificationPreferenceModule,
    flag: PreferenceChannelFlag,
    enabled: boolean,
  ): Promise<boolean> {
    const workflowKey = `${moduleName}.general`;
    const type = CHANNEL_FLAG_TO_TYPE[flag];
    return updatePreferences({
      workflowOverrides: {
        [workflowKey]: {
          ...(preference.value?.workflowOverrides?.[workflowKey] ?? {}),
          [type]: enabled,
        },
      },
    });
  }

  function setGlobalChannel(flag: PreferenceChannelFlag, enabled: boolean): Promise<boolean> {
    return updatePreferences({
      globalChannels: { [CHANNEL_FLAG_TO_TYPE[flag]]: enabled },
    });
  }

  return {
    preference,
    settings,
    isLoading,
    isSaving,
    error,
    modules: NOTIFICATION_PREFERENCE_MODULES,
    hasChannel,
    hasGlobalChannel,
    loadPreferences,
    updatePreferences,
    setModuleChannel,
    setGlobalChannel,
  };
}
