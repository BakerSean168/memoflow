<template>
  <SettingsSection :title="t('setting.appearance.title')" test-id="appearance-settings-card">
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
            <ThemePreview
              :theme="option.value"
              :light-accent="selectedLightAccent"
              :dark-accent="selectedDarkAccent"
            />
            <span
              class="mt-2 flex min-h-5 items-center justify-center text-xs font-medium sm:text-sm"
            >
              {{ option.label }}
            </span>
          </span>
        </label>
      </div>
    </fieldset>

    <SettingsPropertyRow :label="lightAccentLabel" test-id="appearance-accent-light-row">
      <div
        class="flex flex-wrap items-center gap-2 sm:justify-end"
        role="radiogroup"
        :aria-label="lightAccentLabel"
      >
        <button
          v-for="option in lightAccentOptions"
          :key="'light-' + option.value"
          type="button"
          role="radio"
          :aria-checked="selectedLightAccent === option.value"
          :tabindex="selectedLightAccent === option.value ? 0 : -1"
          :aria-label="option.label"
          :title="option.label"
          :data-testid="`appearance-accent-option-light-${option.value}`"
          class="inline-block h-7 w-7 shrink-0 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="
            selectedLightAccent === option.value
              ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
              : 'ring-1 ring-border/60'
          "
          :style="{ backgroundColor: option.swatch }"
          @click="selectLightAccent(option.value)"
          @keydown="onAccentKeydown($event, option.value, 'light')"
        ></button>
      </div>
    </SettingsPropertyRow>

    <SettingsPropertyRow :label="darkAccentLabel" test-id="appearance-accent-dark-row">
      <div
        class="flex flex-wrap items-center gap-2 sm:justify-end"
        role="radiogroup"
        :aria-label="darkAccentLabel"
      >
        <button
          v-for="option in darkAccentOptions"
          :key="'dark-' + option.value"
          type="button"
          role="radio"
          :aria-checked="selectedDarkAccent === option.value"
          :tabindex="selectedDarkAccent === option.value ? 0 : -1"
          :aria-label="option.label"
          :title="option.label"
          :data-testid="`appearance-accent-option-dark-${option.value}`"
          class="inline-block h-7 w-7 shrink-0 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="
            selectedDarkAccent === option.value
              ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
              : 'ring-1 ring-border/60'
          "
          :style="{ backgroundColor: option.swatch }"
          @click="selectDarkAccent(option.value)"
          @keydown="onAccentKeydown($event, option.value, 'dark')"
        ></button>
      </div>
    </SettingsPropertyRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import ThemePreview from './ThemePreview.vue';
import { useI18n } from 'vue-i18n';
import { ACCENT_PALETTES, type Accent } from '@memoflow/setting-contracts';
import { settingUiHost } from '../setting-ui-host';

const { SettingsPropertyRow, SettingsSection } = settingUiHost.components;

const { t } = useI18n();
const themeGroupId = useId();

type AppearanceTheme = 'light' | 'dark' | 'auto';

interface AppearanceSettings {
  theme?: AppearanceTheme;
  accent?: Accent;
  lightAccent?: Accent;
  darkAccent?: Accent;
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

const lightAccentLabel = computed(() => t('setting.appearance.accentLightColor', '浅色模式强调色'));
const darkAccentLabel = computed(() => t('setting.appearance.accentDarkColor', '深色模式强调色'));

const ACCENT_LIST: Array<{
  value: Accent;
  labelKey: string;
}> = [
  {
    value: 'brand-gold',
    labelKey: 'setting.appearance.accentBrandGold',
  },
  {
    value: 'linear-indigo',
    labelKey: 'setting.appearance.accentLinearIndigo',
  },
  {
    value: 'ocean-blue',
    labelKey: 'setting.appearance.accentOceanBlue',
  },
  {
    value: 'emerald-green',
    labelKey: 'setting.appearance.accentEmeraldGreen',
  },
  {
    value: 'rose-red',
    labelKey: 'setting.appearance.accentRoseRed',
  },
  {
    value: 'violet',
    labelKey: 'setting.appearance.accentViolet',
  },
];

const lightAccentOptions = computed(() =>
  ACCENT_LIST.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    swatch: ACCENT_PALETTES[option.value].light.color,
  })),
);

const darkAccentOptions = computed(() =>
  ACCENT_LIST.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    swatch: ACCENT_PALETTES[option.value].dark.color,
  })),
);

const selectedLightAccent = computed<Accent>(
  () => props.modelValue.lightAccent ?? props.modelValue.accent ?? 'brand-gold',
);
const selectedDarkAccent = computed<Accent>(
  () => props.modelValue.darkAccent ?? props.modelValue.accent ?? 'brand-gold',
);

function onAccentKeydown(event: KeyboardEvent, accent: Accent, mode: 'light' | 'dark'): void {
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
    ? 1
    : ['ArrowLeft', 'ArrowUp'].includes(event.key)
      ? -1
      : 0;
  if (!direction) return;
  event.preventDefault();
  const index = ACCENT_LIST.findIndex((option) => option.value === accent);
  const next = ACCENT_LIST[(index + direction + ACCENT_LIST.length) % ACCENT_LIST.length]!;
  if (mode === 'light') {
    selectLightAccent(next.value);
  } else {
    selectDarkAccent(next.value);
  }
  const group = (event.currentTarget as HTMLElement).parentElement;
  group
    ?.querySelector<HTMLButtonElement>(
      `[data-testid="appearance-accent-option-${mode}-${next.value}"]`,
    )
    ?.focus();
}

function selectLightAccent(accent: Accent): void {
  if (accent === selectedLightAccent.value) return;
  emit('update:modelValue', {
    ...props.modelValue,
    lightAccent: accent,
    accent: props.modelValue.theme === 'dark' ? selectedDarkAccent.value : accent,
  });
}

function selectDarkAccent(accent: Accent): void {
  if (accent === selectedDarkAccent.value) return;
  emit('update:modelValue', {
    ...props.modelValue,
    darkAccent: accent,
    accent: props.modelValue.theme === 'dark' ? accent : selectedLightAccent.value,
  });
}
</script>
