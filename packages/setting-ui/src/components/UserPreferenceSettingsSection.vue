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
import SettingsResetSection from './SettingsResetSection.vue';
import { settingUiHost } from '../setting-ui-host';

const { SettingsStatusBlock } = settingUiHost.components;

type PreferenceResetTarget = 'all' | 'presentation' | 'regional';
import { useUserPreferences } from '../composables/useUserPreferences';
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
  resetPreferenceNamespace,
  resetAllUserPreferences,
} = useUserPreferences();

const appearance = ref<{ theme: PresentationPreferences['theme']; accent: Accent }>({
  theme: DEFAULT_USER_PREFERENCE_PROFILE.presentation.theme,
  accent: DEFAULT_USER_PREFERENCE_PROFILE.presentation.accent,
});
const locale = ref<RegionalPreferences & { language: PresentationPreferences['language'] }>({
  language: DEFAULT_USER_PREFERENCE_PROFILE.presentation.language,
  ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
});
const resetting = ref(false);
const hasLoadedPreferences = computed(() => presentation.value !== null && regional.value !== null);

function isSupportedLocale(value: unknown): value is SettingLocale {
  return value === 'zh-CN' || value === 'en-US';
}

function hydrateCanonicalPreferences(): void {
  const presentationValue = presentation.value?.preferences;
  const regionalValue = regional.value?.preferences;
  if (!presentationValue || !regionalValue) return;

  appearance.value = {
    theme: presentationValue.theme,
    accent: presentationValue.accent ?? 'brand-gold',
  };
  locale.value = { language: presentationValue.language, ...regionalValue };
  const profile: UserPreferenceProfile = {
    presentation: presentationValue,
    regional: regionalValue,
  };
  presentationStore.syncFromUserPreferenceProfile(profile);
  settingUiHost.setProductTimePreferences(profile);
}

async function handleAppearanceUpdate(value: {
  theme?: PresentationPreferences['theme'];
  accent?: Accent;
}): Promise<void> {
  const previous = { ...appearance.value };
  const nextTheme = value.theme ?? previous.theme;
  const nextAccent = value.accent ?? previous.accent;
  if (nextTheme === previous.theme && nextAccent === previous.accent) return;

  appearance.value = { theme: nextTheme, accent: nextAccent };
  presentationStore.setTheme(nextTheme);
  applyThemeMode(nextTheme);
  presentationStore.setAccent(nextAccent);
  applyAccent(nextAccent);

  const patch: { theme?: typeof nextTheme; accent?: Accent } = {};
  if (nextTheme !== previous.theme) patch.theme = nextTheme;
  if (nextAccent !== previous.accent) patch.accent = nextAccent;
  if (await patchPresentation(patch)) return;

  appearance.value = previous;
  presentationStore.setTheme(previous.theme);
  applyThemeMode(previous.theme);
  presentationStore.setAccent(previous.accent);
  applyAccent(previous.accent);
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

async function handleReset(target: PreferenceResetTarget): Promise<void> {
  resetting.value = true;
  try {
    const resetOk =
      target === 'all' ? await resetAllUserPreferences() : await resetPreferenceNamespace(target);
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
  <section class="space-y-7" data-testid="user-preference-settings-section">
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
      <SettingsResetSection
        :current-theme="presentation?.preferences.theme ?? null"
        :resetting="resetting"
        @reset="handleReset"
      />
    </template>
  </section>
</template>
