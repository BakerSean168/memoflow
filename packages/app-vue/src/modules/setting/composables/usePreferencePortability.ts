/** V3-only preference import/export composable. */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { ExportSettingsRes, ImportSettingsRes } from '@memoflow/contracts/setting';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';

export function usePreferencePortability() {
  const { t } = useI18n();
  const service = useStrictInject(SETTING_SERVICE_KEY, 'SettingService');
  const error = ref<string | null>(null);
  const handleError = createComposableHandleError({
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
      const content = JSON.stringify(sanitizeForIpc(data));
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
