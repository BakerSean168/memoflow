import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { createSystemTimeZoneSource } from '@memoflow/time';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';

/**
 * Root presentation bootstrap from the canonical UserPreferenceProfile.
 * No legacy UserSetting/defaults/Account preference fallback is allowed here.
 */
export function usePresentationBootstrap() {
  const presentationStore = usePresentationPreferenceStore();
  const settingService = useStrictInject(SETTING_SERVICE_KEY, 'SettingService');

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

        if (regional.namespace === 'regional' && regional.revision === 0) {
          const deviceTimeZone = createSystemTimeZoneSource().currentTimeZoneId();
          try {
            unwrapOrThrowError<PreferenceMutationReceipt>(
              await settingService.patchPreferenceNamespace(
                'regional',
                { timeZone: deviceTimeZone },
                0,
              ),
            );
          } catch {
            const latest = unwrapOrThrowError<PreferenceNamespaceResponse>(
              await settingService.getPreferenceNamespace('regional'),
            );
            if (latest.namespace !== 'regional' || latest.revision === 0) {
              throw new Error('Could not initialize canonical device timezone');
            }
          }
        }

        const profile = unwrapOrThrowError<UserPreferenceProfile>(
          await settingService.getPreferenceProfile(),
        );
        presentationStore.syncFromUserPreferenceProfile(profile);
        setProductTimePreferences(profile);
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
