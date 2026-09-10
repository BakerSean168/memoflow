/**
 * Residual 973: createComposableHandleError sole factory.
 * useUserSetting - 设置模块主 composable
 *
 * 通过 inject 获取 setting client seam。
 * Setting client 返回 Result<T>，在这里统一解包为 DTO，
 * 失败时抛出结构化异常后由 try/catch 处理。
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import { useUserSettingStore } from '../stores/user-setting-store';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import type {
  PreferenceCategory,
  ExportSettingsRes,
  ImportSettingsRes,
  UserSettingClientDTO,
  UserSettingPreferences,
} from '@memoflow/contracts/setting';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';

export function useUserSetting() {
  const { t } = useI18n();
  const service = useStrictInject(SETTING_SERVICE_KEY, 'SettingService');
  const store = useUserSettingStore();

  const isLoading = computed(() => store.isLoading);
  const error = computed(() => store.error);
  const userSetting = computed(() => store.userSetting);
  const defaults = computed(() => store.defaults);

  const handleError = createComposableHandleError({
    t,
    setError: (message) => store.setError(message),
  });

  /** 获取指定分类设置（未设置时回退默认值） */
  function getCategory<K extends PreferenceCategory>(
    category: K,
  ): UserSettingPreferences[K] | undefined {
    return store.getCategory(category);
  }

  /** 按 dot-notation key 获取值 (e.g., 'appearance.theme') */
  function getValue(key: string): unknown {
    return store.getValue(key);
  }

  async function loadSettings() {
    store.setLoading(true);
    store.setError(null);
    try {
      const data = unwrapOrThrowError<UserSettingClientDTO>(await service.getUserSettings());
      store.setUserSetting(data);
      store.setInitialized(true);
    } catch (e: unknown) {
      handleError(e, 'setting.errors.loadFailed');
    } finally {
      store.setLoading(false);
    }
  }

  async function loadDefaults() {
    store.setError(null);
    try {
      const data = unwrapOrThrowError<UserSettingClientDTO>(await service.getUserSettingDefaults());
      store.setDefaults(data);
    } catch (e: unknown) {
      handleError(e, 'setting.errors.loadDefaultsFailed');
    }
  }

  /** 按分类更新设置 (e.g., updateCategory('appearance', { theme: 'dark' })) */
  async function updateCategory<K extends PreferenceCategory>(
    category: K,
    partial: Partial<UserSettingPreferences[K]>,
  ) {
    store.setError(null);
    try {
      const data = unwrapOrThrowError<UserSettingClientDTO>(
        await service.patchCategory(category, sanitizeForIpc(partial) as Record<string, unknown>),
      );
      store.setUserSetting(data);
      store.setInitialized(true);
      return data;
    } catch (e: unknown) {
      handleError(e, 'setting.errors.updateFailed');
      return null;
    }
  }

  /** 重置设置：传入 category 只重置该分类；不传则全量重置。 */
  async function resetToDefaults(category?: PreferenceCategory) {
    store.setError(null);
    try {
      const data = unwrapOrThrowError<UserSettingClientDTO>(
        await service.resetUserSettings(category),
      );
      store.setUserSetting(data);
      store.setInitialized(true);
    } catch (e: unknown) {
      handleError(e, 'setting.errors.resetFailed');
    }
  }

  async function exportSettings() {
    try {
      return unwrapOrThrowError<ExportSettingsRes>(await service.exportSettings());
    } catch (e: unknown) {
      handleError(e, 'setting.errors.exportFailed');
      return null;
    }
  }

  async function importSettings(data: unknown) {
    store.setError(null);
    try {
      const content = JSON.stringify(sanitizeForIpc(data));
      if (typeof content !== 'string') {
        throw new TypeError('Preference import payload is not serializable JSON');
      }
      return unwrapOrThrowError<ImportSettingsRes>(await service.importSettings(content));
    } catch (e: unknown) {
      handleError(e, 'setting.errors.importFailed');
      return null;
    }
  }

  return {
    userSetting,
    defaults,
    isLoading,
    error,
    getCategory,
    getValue,
    loadSettings,
    loadDefaults,
    updateCategory,
    resetToDefaults,
    exportSettings,
    importSettings,
  };
}
