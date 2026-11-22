<template>
  <SettingsSection
    :title="t('setting.appearance.title')"
    :description="t('setting.appearance.themeDescription')"
    test-id="appearance-settings-card"
  >
    <fieldset class="min-w-0 pb-6" data-testid="appearance-theme-row">
      <legend class="sr-only">{{ t('setting.appearance.theme') }}</legend>
      <div class="grid grid-cols-3 gap-2 sm:gap-3">
        <label v-for="option in themeOptions" :key="option.value" class="min-w-0 cursor-pointer">
          <input
            type="radio"
            :name="themeGroupId"
            :value="option.value"
            :checked="(modelValue.theme ?? 'auto') === option.value"
            :aria-label="option.label"
            :data-testid="`appearance-theme-option-${option.value}`"
            class="peer sr-only"
            @change="emit('update:modelValue', { ...modelValue, theme: option.value })"
          />
          <span
            class="block rounded-lg border border-border/70 p-1.5 transition-colors hover:border-muted-foreground/50 peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring sm:p-2"
          >
            <ThemePreview :theme="option.value" :accent="previewAccent" />
            <span
              class="mt-2 flex min-h-5 items-center justify-center text-xs font-medium sm:text-sm"
            >
              {{ option.label }}
            </span>
          </span>
        </label>
      </div>
    </fieldset>

    <SettingsPropertyRow
      :label="t('setting.appearance.accentColor')"
      :description="t('setting.appearance.accentColorDescription')"
      test-id="appearance-accent-row"
    >
      <div
        class="flex flex-wrap items-center gap-2 sm:justify-end"
        role="radiogroup"
        :aria-label="t('setting.appearance.accentColor')"
      >
        <button
          v-for="option in accentOptions"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="selectedAccent === option.value"
          :tabindex="selectedAccent === option.value ? 0 : -1"
          :aria-label="option.label"
          :title="option.label"
          :data-testid="`appearance-accent-option-${option.value}`"
          class="inline-block h-7 w-7 shrink-0 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="
            selectedAccent === option.value
              ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
              : 'ring-1 ring-border/60'
          "
          :style="{ backgroundColor: option.swatch }"
          @click="selectAccent(option.value)"
          @keydown="onAccentKeydown($event, option.value)"
        ></button>
      </div>
    </SettingsPropertyRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import ThemePreview from './ThemePreview.vue';
import { useI18n } from 'vue-i18n';
import type { Accent } from '@memoflow/setting-contracts';
import { settingUiHost } from '../setting-ui-host';

const { SettingsPropertyRow, SettingsSection } = settingUiHost.components;

const { t } = useI18n();
const themeGroupId = useId();

type AppearanceTheme = 'light' | 'dark' | 'auto';

interface AppearanceSettings {
  theme?: AppearanceTheme;
  accent?: Accent;
}

interface Props {
  modelValue: AppearanceSettings;
  themeOptions?: Array<{ label: string; value: AppearanceTheme }>;
}

const props = withDefaults(defineProps<Props>(), {
  themeOptions: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: AppearanceSettings];
}>();

const themeOptions = computed(
  () =>
    props.themeOptions ?? [
      { label: t('setting.appearance.themeAuto'), value: 'auto' as const },
      { label: t('setting.appearance.themeLight'), value: 'light' as const },
      { label: t('setting.appearance.themeDark'), value: 'dark' as const },
    ],
);

/**
 * Swatches mirror each accent's light `--primary`. They are presentation-only
 * hints; the actual theme colors come from theme.css.
 */
const ACCENT_OPTIONS: Array<{
  value: Accent;
  swatch: string;
  labelKey: string;
}> = [
  {
    value: 'brand-gold',
    swatch: '#C37C09',
    labelKey: 'setting.appearance.accentBrandGold',
  },
  {
    value: 'linear-indigo',
    swatch: '#4E59D0',
    labelKey: 'setting.appearance.accentLinearIndigo',
  },
  {
    value: 'ocean-blue',
    swatch: '#0A73A4',
    labelKey: 'setting.appearance.accentOceanBlue',
  },
  {
    value: 'emerald-green',
    swatch: '#0B7A55',
    labelKey: 'setting.appearance.accentEmeraldGreen',
  },
  {
    value: 'rose-red',
    swatch: '#D91C45',
    labelKey: 'setting.appearance.accentRoseRed',
  },
  {
    value: 'violet',
    swatch: '#6A1FEA',
    labelKey: 'setting.appearance.accentViolet',
  },
];

const accentOptions = computed(() =>
  ACCENT_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey),
  })),
);

const selectedAccent = computed<Accent>(() => props.modelValue.accent ?? 'brand-gold');
const previewAccent = computed(
  () => ACCENT_OPTIONS.find((option) => option.value === selectedAccent.value)!.swatch,
);

function onAccentKeydown(event: KeyboardEvent, accent: Accent): void {
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
    ? 1
    : ['ArrowLeft', 'ArrowUp'].includes(event.key)
      ? -1
      : 0;
  if (!direction) return;
  event.preventDefault();
  const index = ACCENT_OPTIONS.findIndex((option) => option.value === accent);
  const next = ACCENT_OPTIONS[(index + direction + ACCENT_OPTIONS.length) % ACCENT_OPTIONS.length]!;
  selectAccent(next.value);
  const group = (event.currentTarget as HTMLElement).parentElement;
  group
    ?.querySelector<HTMLButtonElement>(`[data-testid="appearance-accent-option-${next.value}"]`)
    ?.focus();
}

function selectAccent(accent: Accent): void {
  if (accent === selectedAccent.value) return;
  emit('update:modelValue', { ...props.modelValue, accent });
}
</script>
