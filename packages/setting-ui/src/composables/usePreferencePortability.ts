/** V3-only preference import/export composable. */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { ExportSettingsRes, ImportSettingsRes } from '@memoflow/setting-contracts';
import { settingUiHost } from '../setting-ui-host';

export function usePreferencePortability() {
  const { t } = useI18n();
  const service = settingUiHost.useStrictInject(
    settingUiHost.SETTING_SERVICE_KEY,
    'SettingService',
  );
  const error = ref<string | null>(null);
  const handleError = settingUiHost.createComposableHandleError({
    t,
    setError: (message) => {
      error.value = message;
    },
  });

  async function exportSettings(): Promise<ExportSettingsRes | null> {
    error.value = null;
    try {
      return unwrapOrThrowError<ExportSettingsRes>(await service.exportSettings());
    } catch (cause) {
      handleError(cause, 'setting.errors.exportFailed');
      return null;
    }
  }

  async function importSettings(data: unknown): Promise<ImportSettingsRes | null> {
    error.value = null;
    try {
      const content = JSON.stringify(settingUiHost.sanitizeForIpc(data));
      if (typeof content !== 'string') {
        throw new TypeError('Preference import payload is not serializable JSON');
      }
      return unwrapOrThrowError<ImportSettingsRes>(await service.importSettings(content));
    } catch (cause) {
      handleError(cause, 'setting.errors.importFailed');
      return null;
    }
  }

  return { error, exportSettings, importSettings };
}
