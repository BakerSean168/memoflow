import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type {
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
} from '@memoflow/setting-contracts';
import { createSystemTimeZoneSource } from '@memoflow/time';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { settingUiHost } from '../setting-ui-host';

/**
 * Root presentation bootstrap from the canonical UserPreferenceProfile.
 * No legacy UserSetting/defaults/Account preference fallback is allowed here.
 */
export function usePresentationBootstrap() {
  const presentationStore = usePresentationPreferenceStore();
  const settingService = settingUiHost.useStrictInject(
    settingUiHost.SETTING_SERVICE_KEY,
    'SettingService',
  );

  let loadingPromise: Promise<void> | null = null;
  let scheduledLoad: ReturnType<typeof globalThis.setTimeout> | null = null;
  const browserWindow = globalThis as unknown as {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };

  function scheduleLoadUserPreferences() {
    if (loadingPromise || scheduledLoad !== null) return;

    const run = () => {
      scheduledLoad = null;
      void loadUserPreferences();
    };

    if (browserWindow.requestIdleCallback) {
      browserWindow.requestIdleCallback(run, { timeout: 3000 });
      return;
    }
    scheduledLoad = globalThis.setTimeout(run, 0);
  }

  async function loadUserPreferences(): Promise<void> {
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      try {
        const regional = unwrapOrThrowError<PreferenceNamespaceResponse>(
          await settingService.getPreferenceNamespace('regional'),
        );

        const profile = unwrapOrThrowError<UserPreferenceProfile>(
          await settingService.getPreferenceProfile(),
        );
        // Revision zero means only "not present locally", not "absent on the
        // server". Device defaults are session-only, never bootstrap writes.
        const sessionProfile =
          regional.namespace === 'regional' && regional.revision === 0
            ? {
                ...profile,
                regional: {
                  ...profile.regional,
                  timeZone: createSystemTimeZoneSource().currentTimeZoneId(),
                },
              }
            : profile;
        presentationStore.syncFromUserPreferenceProfile(sessionProfile);
        settingUiHost.setProductTimePreferences(sessionProfile);
      } catch (error) {
        // Presentation bootstrap is best-effort. The local browser/device
        // defaults remain active until a canonical profile can be loaded.
        console.error('[settings] Failed to bootstrap canonical presentation preferences', error);
      } finally {
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  }

  scheduleLoadUserPreferences();

  return {
    loadUserPreferences,
  };
}
