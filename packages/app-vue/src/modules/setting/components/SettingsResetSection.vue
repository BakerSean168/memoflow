<script setup lang="ts">
/** Canonical presentation/regional reset control. Mutation ownership stays in the parent User Preferences section. */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { RotateCcw } from '@lucide/vue';
import type { PresentationPreferences } from '@memoflow/contracts/setting';
import { SettingsDangerZone, SettingsPropertyRow } from '../../../components/shared/settings';

type PreferenceResetTarget = 'all' | 'presentation' | 'regional';

const props = withDefaults(
  defineProps<{
    currentTheme?: PresentationPreferences['theme'] | null;
    resetting?: boolean;
  }>(),
  {
    currentTheme: null,
    resetting: false,
  },
);

const emit = defineEmits<{
  reset: [target: PreferenceResetTarget];
}>();

const { t } = useI18n();
const target = ref<PreferenceResetTarget>('all');

function updateTarget(value: unknown): void {
  if (value === 'all' || value === 'presentation' || value === 'regional') {
    target.value = value;
  }
}
</script>

<template>
  <SettingsDangerZone
    :title="t('setting.resetPreferences.title')"
    :description="t('setting.resetPreferences.description')"
    test-id="settings-reset-section"
  >
    <div class="mt-4 divide-y divide-destructive/10">
      <SettingsPropertyRow :label="t('setting.resetPreferences.currentTheme')">
        <p class="text-sm font-medium sm:text-right" data-testid="settings-reset-current-theme">
          {{ props.currentTheme ?? t('setting.resetPreferences.themeUnknown') }}
        </p>
      </SettingsPropertyRow>

      <SettingsPropertyRow
        :label="t('setting.resetPreferences.categoryLabel')"
        html-for="settings-reset-category"
      >
        <Select :model-value="target" @update:model-value="updateTarget">
          <SelectTrigger
            id="settings-reset-category"
            class="w-full"
            data-testid="settings-reset-category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ t('setting.resetPreferences.categoryAll') }}</SelectItem>
            <SelectItem value="presentation">
              {{ t('setting.resetPreferences.categoryPresentation') }}
            </SelectItem>
            <SelectItem value="regional">
              {{ t('setting.resetPreferences.categoryRegional') }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsPropertyRow>
    </div>

    <template #actions>
      <Button
        variant="outline"
        data-testid="settings-reset-button"
        :disabled="props.resetting"
        @click="emit('reset', target)"
      >
        <RotateCcw class="mr-2 h-4 w-4" />
        {{
          props.resetting
            ? t('setting.resetPreferences.resetting')
            : t('setting.resetPreferences.resetButton')
        }}
      </Button>
    </template>
  </SettingsDangerZone>
</template>
