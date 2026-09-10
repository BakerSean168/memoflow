import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type {
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  PresentationPreferences,
  RegionalPreferences,
} from '@memoflow/contracts/setting';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';

type PresentationResponse = Extract<PreferenceNamespaceResponse, { namespace: 'presentation' }>;
type RegionalResponse = Extract<PreferenceNamespaceResponse, { namespace: 'regional' }>;

export function useUserPreferences() {
  const { t } = useI18n();
  const service = useStrictInject(SETTING_SERVICE_KEY, 'SettingService');
  const presentation = ref<PresentationResponse | null>(null);
  const regional = ref<RegionalResponse | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const handleError = createComposableHandleError({
    t,
    setError: (message) => {
      error.value = message;
    },
  });

  async function loadNamespace(namespace: 'presentation' | 'regional') {
    const response = unwrapOrThrowError<PreferenceNamespaceResponse>(
      await service.getPreferenceNamespace(namespace),
    );
    if (response.namespace !== namespace) {
      throw new TypeError(
        `Preference namespace response mismatch: expected ${namespace}, got ${response.namespace}`,
      );
    }
    if (namespace === 'presentation') presentation.value = response as PresentationResponse;
    else regional.value = response as RegionalResponse;
  }

  async function loadPreferences() {
    isLoading.value = true;
    error.value = null;
    try {
      await Promise.all([loadNamespace('presentation'), loadNamespace('regional')]);
      return true;
    } catch (cause) {
      handleError(cause, 'setting.errors.loadFailed');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function patchPresentation(patch: PreferenceNamespacePatch<'presentation'>) {
    const current = presentation.value;
    if (!current) return false;
    error.value = null;
    try {
      const receipt = unwrapOrThrowError(
        await service.patchPreferenceNamespace('presentation', patch, current.revision),
      );
      presentation.value = {
        namespace: 'presentation',
        preferences: { ...current.preferences, ...patch } as PresentationPreferences,
        revision: receipt.revision,
      };
      return true;
    } catch (cause) {
      handleError(cause, 'setting.errors.updateFailed');
      await loadNamespace('presentation').catch(() => undefined);
      return false;
    }
  }

  async function patchRegional(patch: PreferenceNamespacePatch<'regional'>) {
    const current = regional.value;
    if (!current) return false;
    error.value = null;
    try {
      const receipt = unwrapOrThrowError(
        await service.patchPreferenceNamespace('regional', patch, current.revision),
      );
      regional.value = {
        namespace: 'regional',
        preferences: { ...current.preferences, ...patch } as RegionalPreferences,
        revision: receipt.revision,
      };
      return true;
    } catch (cause) {
      handleError(cause, 'setting.errors.updateFailed');
      await loadNamespace('regional').catch(() => undefined);
      return false;
    }
  }

  async function resetPreferenceNamespace(namespace: 'presentation' | 'regional') {
    const current = namespace === 'presentation' ? presentation.value : regional.value;
    if (!current) return false;
    error.value = null;
    try {
      unwrapOrThrowError(await service.resetPreferenceNamespace(namespace, current.revision));
      await loadNamespace(namespace);
      return true;
    } catch (cause) {
      handleError(cause, 'setting.errors.resetFailed');
      await loadNamespace(namespace).catch(() => undefined);
      return false;
    }
  }

  return {
    presentation: computed(() => presentation.value),
    regional: computed(() => regional.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    loadPreferences,
    patchPresentation,
    patchRegional,
    resetPreferenceNamespace,
  };
}
