<template>
  <SettingsSection
    :title="t('setting.appearance.title')"
    :description="t('setting.appearance.themeDescription')"
    test-id="appearance-settings-card"
  >
    <SettingsPropertyRow
      :label="t('setting.appearance.theme')"
      html-for="theme-select"
      test-id="appearance-theme-row"
    >
      <Select
        :model-value="modelValue.theme"
        @update:model-value="
          (value: any) =>
            emit('update:modelValue', { ...modelValue, theme: value as AppearanceTheme })
        "
      >
        <SelectTrigger id="theme-select" class="w-full" data-testid="appearance-theme-trigger">
          <SelectValue :placeholder="t('setting.appearance.themePlaceholder')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
            :data-testid="`appearance-theme-option-${option.value}`"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </SettingsPropertyRow>

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
          :aria-label="option.label"
          :title="option.label"
          :data-testid="`appearance-accent-option-${option.value}`"
          class="relative inline-flex h-7 w-7 items-center justify-center rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="
            selectedAccent === option.value
              ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
              : 'ring-1 ring-border/60'
          "
          :style="{ backgroundColor: option.swatch }"
          @click="selectAccent(option.value)"
        >
          <svg
            v-if="selectedAccent === option.value"
            class="h-3.5 w-3.5"
            :class="option.checkClassName"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
    </SettingsPropertyRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Accent } from '@memoflow/setting-contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { settingUiHost } from '../setting-ui-host';

const { SettingsPropertyRow, SettingsSection } = settingUiHost.components;

const { t } = useI18n();

type AppearanceTheme = 'light' | 'dark' | 'auto';

interface AppearanceSettings {
  theme?: AppearanceTheme;
  accent?: Accent;
}

interface Props {
  modelValue: AppearanceSettings;
  themeOptions?: Array<{ label: string; value: string }>;
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
      { label: '☀️ ' + t('setting.appearance.themeLight'), value: 'light' },
      { label: '🌙 ' + t('setting.appearance.themeDark'), value: 'dark' },
      { label: '🖥️ ' + t('setting.appearance.themeAuto'), value: 'auto' },
    ],
);

/**
 * Swatches mirror each accent's light `--primary`. They are presentation-only
 * hints; the actual theme colors come from theme.css.
 */
const ACCENT_OPTIONS: Array<{
  value: Accent;
  swatch: string;
  checkClassName: string;
  labelKey: string;
}> = [
  {
    value: 'brand-gold',
    swatch: '#C37C09',
    checkClassName: 'text-[#25190E]',
    labelKey: 'setting.appearance.accentBrandGold',
  },
  {
    value: 'linear-indigo',
    swatch: '#4E59D0',
    checkClassName: 'text-white',
    labelKey: 'setting.appearance.accentLinearIndigo',
  },
  {
    value: 'ocean-blue',
    swatch: '#0A73A4',
    checkClassName: 'text-white',
    labelKey: 'setting.appearance.accentOceanBlue',
  },
  {
    value: 'emerald-green',
    swatch: '#0B7A55',
    checkClassName: 'text-white',
    labelKey: 'setting.appearance.accentEmeraldGreen',
  },
  {
    value: 'rose-red',
    swatch: '#D91C45',
    checkClassName: 'text-white',
    labelKey: 'setting.appearance.accentRoseRed',
  },
  {
    value: 'violet',
    swatch: '#6A1FEA',
    checkClassName: 'text-white',
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

function selectAccent(accent: Accent): void {
  if (accent === selectedAccent.value) return;
  emit('update:modelValue', { ...props.modelValue, accent });
}
</script>
