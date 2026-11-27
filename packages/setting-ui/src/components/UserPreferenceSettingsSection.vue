<script setup lang="ts">
/**
 * User Preferences owner section: presentation + regional only.
 * It owns canonical load/mutate/reset state so the Settings root never shadows this owner.
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  DEFAULT_USER_PREFERENCE_PROFILE,
  type Accent,
  type PresentationPreferences,
  type RegionalPreferences,
  type UserPreferenceProfile,
} from '@memoflow/setting-contracts';
import AppearanceSettings from './AppearanceSettings.vue';
import LocaleSettings from './LocaleSettings.vue';
import { settingUiHost } from '../setting-ui-host';

const { SettingsStatusBlock } = settingUiHost.components;

import { useUserPreferences } from '../composables/useUserPreferences';
import { useSettingsSectionReset } from '../composables/useSettingsSectionReset';
import { applyAccent, applyThemeMode } from '../composables';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import type { SettingLocale } from '../setting-ui-host';

const presentationStore = usePresentationPreferenceStore();
const {
  presentation,
  regional,
  isLoading,
  error,
  loadPreferences,
  patchPresentation,
  patchRegional,
  resetAllUserPreferences,
} = useUserPreferences();

const appearance = ref<{
  theme: PresentationPreferences['theme'];
  accent: Accent;
  lightAccent: Accent;
  darkAccent: Accent;
}>({
  theme: DEFAULT_USER_PREFERENCE_PROFILE.presentation.theme,
  accent: DEFAULT_USER_PREFERENCE_PROFILE.presentation.accent,
  lightAccent: DEFAULT_USER_PREFERENCE_PROFILE.presentation.lightAccent,
  darkAccent: DEFAULT_USER_PREFERENCE_PROFILE.presentation.darkAccent,
});
const locale = ref<RegionalPreferences & { language: PresentationPreferences['language'] }>({
  language: DEFAULT_USER_PREFERENCE_PROFILE.presentation.language,
  ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
});
const hasLoadedPreferences = computed(() => presentation.value !== null && regional.value !== null);

function isSupportedLocale(value: unknown): value is SettingLocale {
  return value === 'zh-CN' || value === 'en-US';
}

function hydrateCanonicalPreferences(): void {
  const presentationValue = presentation.value?.preferences;
  const regionalValue = regional.value?.preferences;
  if (!presentationValue || !regionalValue) return;

  const fallback = presentationValue.accent ?? 'brand-gold';
  const light = presentationValue.lightAccent ?? fallback;
  const dark = presentationValue.darkAccent ?? fallback;
  const isDark =
    presentationValue.theme === 'dark' ||
    (presentationValue.theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const active = isDark ? dark : light;

  appearance.value = {
    theme: presentationValue.theme,
    accent: presentationValue.accent ?? active,
    lightAccent: light,
    darkAccent: dark,
  };
  locale.value = { language: presentationValue.language, ...regionalValue };
  const profile: UserPreferenceProfile = {
    presentation: presentationValue,
    regional: regionalValue,
  };
  presentationStore.syncFromUserPreferenceProfile(profile);
  applyThemeMode(presentationValue.theme);
  applyAccent(presentationStore.resolveActiveAccent());
  settingUiHost.setProductTimePreferences(profile);
}

async function handleAppearanceUpdate(value: {
  theme?: PresentationPreferences['theme'];
  accent?: Accent;
  lightAccent?: Accent;
  darkAccent?: Accent;
}): Promise<void> {
  const previous = { ...appearance.value };
  const nextTheme = value.theme ?? previous.theme;
  const nextLightAccent =
    value.lightAccent ??
    (value.accent && value.lightAccent === undefined ? value.accent : previous.lightAccent);
  const nextDarkAccent =
    value.darkAccent ??
    (value.accent && value.darkAccent === undefined ? value.accent : previous.darkAccent);

  const themeChanged = nextTheme !== previous.theme;
  const lightChanged =
    value.lightAccent !== undefined && value.lightAccent !== previous.lightAccent;
  const darkChanged = value.darkAccent !== undefined && value.darkAccent !== previous.darkAccent;
  const legacyAccentChanged =
    value.accent !== undefined &&
    value.lightAccent === undefined &&
    value.darkAccent === undefined &&
    value.accent !== previous.accent;

  if (!themeChanged && !lightChanged && !darkChanged && !legacyAccentChanged) return;

  const isDark =
    nextTheme === 'dark' ||
    (nextTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const nextActiveAccent = isDark ? nextDarkAccent : nextLightAccent;

  appearance.value = {
    theme: nextTheme,
    accent: nextActiveAccent,
    lightAccent: nextLightAccent,
    darkAccent: nextDarkAccent,
  };

  presentationStore.setTheme(nextTheme);
  presentationStore.setLightAccent(nextLightAccent);
  presentationStore.setDarkAccent(nextDarkAccent);

  applyThemeMode(nextTheme);
  applyAccent(presentationStore.resolveActiveAccent());

  const patch: Partial<PresentationPreferences> = {};
  if (themeChanged) patch.theme = nextTheme;
  if (lightChanged || legacyAccentChanged) patch.lightAccent = nextLightAccent;
  if (darkChanged || legacyAccentChanged) patch.darkAccent = nextDarkAccent;
  if (themeChanged || lightChanged || darkChanged || legacyAccentChanged) {
    patch.accent = nextActiveAccent;
  }

  if (await patchPresentation(patch)) return;

  // Failure rollback: only roll back changed state
  appearance.value = previous;
  presentationStore.setTheme(previous.theme);
  presentationStore.setLightAccent(previous.lightAccent);
  presentationStore.setDarkAccent(previous.darkAccent);
  applyThemeMode(previous.theme);
  applyAccent(presentationStore.resolveActiveAccent());
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
  const regionalOk = Object.keys(regionalPatch).length ? await patchRegional(regionalPatch) : true;
  if (presentationOk && regionalOk) return;

  await loadPreferences();
  hydrateCanonicalPreferences();
}

async function handleReset(): Promise<void> {
  if (await resetAllUserPreferences()) hydrateCanonicalPreferences();
}

watch([presentation, regional], hydrateCanonicalPreferences);

// The settings shell restores the active section through the same action.
useSettingsSectionReset('appearance', handleReset);

onMounted(async () => {
  await loadPreferences();
  hydrateCanonicalPreferences();
});
</script>

<template>
  <section class="space-y-8" data-testid="user-preference-settings-section">
    <SettingsStatusBlock
      v-if="isLoading && !hasLoadedPreferences"
      kind="loading"
      test-id="user-preference-loading"
    />

    <SettingsStatusBlock
      v-else-if="error && !hasLoadedPreferences"
      kind="error"
      :description="error"
      test-id="user-preference-load-error"
    />

    <template v-else>
      <SettingsStatusBlock
        v-if="error"
        kind="error"
        :description="error"
        test-id="user-preference-mutation-error"
      />
      <AppearanceSettings :model-value="appearance" @update:model-value="handleAppearanceUpdate" />
      <LocaleSettings :model-value="locale" @update:model-value="handleLocaleUpdate" />
    </template>
  </section>
</template>
