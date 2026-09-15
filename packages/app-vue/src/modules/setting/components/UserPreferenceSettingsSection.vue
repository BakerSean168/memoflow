<script setup lang="ts">
/**
 * User Preferences owner section: presentation + regional only.
 * It owns canonical load/mutate/reset state so the Settings root never shadows this owner.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { Loader2 } from '@lucide/vue';
import {
  DEFAULT_USER_PREFERENCE_PROFILE,
  type PresentationPreferences,
  type RegionalPreferences,
  type UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import AppearanceSettings from './AppearanceSettings.vue';
import LocaleSettings from './LocaleSettings.vue';
import SettingsResetSection from './SettingsResetSection.vue';

type PreferenceResetTarget = 'all' | 'presentation' | 'regional';
import { useUserPreferences } from '../composables/useUserPreferences';
import { applyThemeMode } from '../composables';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import type { AppLocale } from '../../../plugins/i18n';

const presentationStore = usePresentationPreferenceStore();
const {
  presentation,
  regional,
  isLoading,
  error,
  loadPreferences,
  patchPresentation,
  patchRegional,
  resetPreferenceNamespace,
  resetAllUserPreferences,
} = useUserPreferences();

const appearance = ref<{ theme: PresentationPreferences['theme'] }>({
  theme: DEFAULT_USER_PREFERENCE_PROFILE.presentation.theme,
});
const locale = ref<RegionalPreferences & { language: PresentationPreferences['language'] }>({
  language: DEFAULT_USER_PREFERENCE_PROFILE.presentation.language,
  ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
});
const resetting = ref(false);
const hasLoadedPreferences = computed(() => presentation.value !== null && regional.value !== null);

function isSupportedLocale(value: unknown): value is AppLocale {
  return value === 'zh-CN' || value === 'en-US';
}

function hydrateCanonicalPreferences(): void {
  const presentationValue = presentation.value?.preferences;
  const regionalValue = regional.value?.preferences;
  if (!presentationValue || !regionalValue) return;

  appearance.value = { theme: presentationValue.theme };
  locale.value = { language: presentationValue.language, ...regionalValue };
  const profile: UserPreferenceProfile = {
    presentation: presentationValue,
    regional: regionalValue,
  };
  presentationStore.syncFromUserPreferenceProfile(profile);
  setProductTimePreferences(profile);
}

async function handleAppearanceUpdate(value: { theme?: PresentationPreferences['theme'] }): Promise<void> {
  const nextTheme = value.theme ?? appearance.value.theme;
  const previousTheme = appearance.value.theme;
  if (nextTheme === previousTheme) return;

  appearance.value = { theme: nextTheme };
  presentationStore.setTheme(nextTheme);
  applyThemeMode(nextTheme);
  if (await patchPresentation({ theme: nextTheme })) return;

  appearance.value = { theme: previousTheme };
  presentationStore.setTheme(previousTheme);
  applyThemeMode(previousTheme);
}

async function handleLocaleUpdate(
  value: RegionalPreferences & { language: PresentationPreferences['language'] },
): Promise<void> {
  const previous = { ...locale.value };
  locale.value = { ...value };
  if (isSupportedLocale(value.language)) presentationStore.setLocale(value.language);

  const presentationChanged = value.language !== previous.language;
  const regionalPatch: Partial<RegionalPreferences> = {};
  for (const key of ['timeZone', 'dateStyle', 'timeStyle', 'weekStartsOn'] as const) {
    if (value[key] !== previous[key]) regionalPatch[key] = value[key] as never;
  }

  const presentationOk = presentationChanged
    ? await patchPresentation({ language: value.language })
    : true;
  const regionalOk = Object.keys(regionalPatch).length
    ? await patchRegional(regionalPatch)
    : true;
  if (presentationOk && regionalOk) return;

  await loadPreferences();
  hydrateCanonicalPreferences();
}

async function handleReset(target: PreferenceResetTarget): Promise<void> {
  resetting.value = true;
  try {
    const resetOk =
      target === 'all'
        ? await resetAllUserPreferences()
        : await resetPreferenceNamespace(target);
    if (resetOk) hydrateCanonicalPreferences();
  } finally {
    resetting.value = false;
  }
}

watch([presentation, regional], hydrateCanonicalPreferences);

onMounted(async () => {
  await loadPreferences();
  hydrateCanonicalPreferences();
});
</script>

<template>
  <section class="space-y-8" data-testid="user-preference-settings-section">
    <div v-if="isLoading && !hasLoadedPreferences" class="flex items-center justify-center py-12">
      <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
    </div>

    <div
      v-else-if="error && !hasLoadedPreferences"
      role="alert"
      class="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      data-testid="user-preference-load-error"
    >
      {{ error }}
    </div>

    <template v-else>
      <p
        v-if="error"
        role="alert"
        class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        data-testid="user-preference-mutation-error"
      >
        {{ error }}
      </p>
      <AppearanceSettings :model-value="appearance" @update:model-value="handleAppearanceUpdate" />
      <LocaleSettings :model-value="locale" @update:model-value="handleLocaleUpdate" />
      <SettingsResetSection
        :current-theme="presentation?.preferences.theme ?? null"
        :resetting="resetting"
        @reset="handleReset"
      />
    </template>
  </section>
</template>
