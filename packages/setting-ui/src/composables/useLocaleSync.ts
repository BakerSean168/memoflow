/**
 * useLocaleSync — Bridges the user setting store to vue-i18n.
 *
 * Call this once from App.vue (or any root-level component).
 * It watches `userSettingStore.getValue('locale.language')` and
 * syncs the value to:
 *   1. vue-i18n's `locale` ref
 *   2. `document.documentElement.lang` attribute
 */

import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { settingUiHost, type SettingLocale } from '../setting-ui-host';

const SUPPORTED: SettingLocale[] = ['zh-CN', 'en-US'];

function isSupportedLocale(v: unknown): v is SettingLocale {
  return typeof v === 'string' && SUPPORTED.includes(v as SettingLocale);
}

export function useLocaleSync() {
  const { locale } = useI18n({ useScope: 'global' });
  const store = usePresentationPreferenceStore();

  // Immediate sync + reactive watch
  const syncLocale = async () => {
    const lang = store.locale;
    if (isSupportedLocale(lang)) {
      if (lang !== locale.value) {
        await settingUiHost.setI18nLocale(lang);
      }

      document.documentElement.lang = lang;
    }
  };

  const runSyncLocale = () => {
    void syncLocale().catch((error) => {
      console.error('[i18n] Failed to sync locale', error);
    });
  };

  // Run once on mount
  runSyncLocale();

  // Watch for subsequent store changes
  watch(() => store.locale, runSyncLocale);

  return { locale };
}
