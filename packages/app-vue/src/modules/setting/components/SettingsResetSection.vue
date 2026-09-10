<script setup lang="ts">
/** Canonical presentation/regional reset control. Mutation ownership stays in the parent User Preferences section. */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@memoflow/ui-vue-shadcn';
import { RotateCcw } from '@lucide/vue';
import type { PresentationPreferences } from '@memoflow/contracts/setting';

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
</script>

<template>
  <Card class="border-border/70" data-testid="settings-reset-section">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <RotateCcw class="h-4 w-4" />
        {{ t('setting.resetPreferences.title') }}
      </CardTitle>
      <CardDescription>{{ t('setting.resetPreferences.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="space-y-1 text-sm">
        <p class="text-muted-foreground">{{ t('setting.resetPreferences.currentTheme') }}</p>
        <p class="font-medium" data-testid="settings-reset-current-theme">
          {{ props.currentTheme ?? t('setting.resetPreferences.themeUnknown') }}
        </p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1 space-y-2">
          <label for="settings-reset-category" class="text-sm font-medium">
            {{ t('setting.resetPreferences.categoryLabel') }}
          </label>
          <select
            id="settings-reset-category"
            v-model="target"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            data-testid="settings-reset-category"
          >
            <option value="all">{{ t('setting.resetPreferences.categoryAll') }}</option>
            <option value="presentation">{{ t('setting.resetPreferences.categoryPresentation') }}</option>
            <option value="regional">{{ t('setting.resetPreferences.categoryRegional') }}</option>
          </select>
        </div>
        <Button
          variant="outline"
          data-testid="settings-reset-button"
          :disabled="props.resetting"
          @click="emit('reset', target)"
        >
          <RotateCcw class="mr-2 h-4 w-4" />
          {{ props.resetting ? t('setting.resetPreferences.resetting') : t('setting.resetPreferences.resetButton') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
