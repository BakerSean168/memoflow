<script setup lang="ts">
/**
 * SettingsResetSection — 偏好设置重置（W6 P1-2 生产消费点）
 *
 * 真实调用 useUserSetting().resetToDefaults(category)：
 *   - 「全部分类」走全量重置；
 *   - 选择单个分类只重置该分类，其他分类保持不变。
 * 同时把当前 appearance.theme 作为只读值展示，方便用户确认即将被重置的内容。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@memoflow/ui-vue-shadcn';
import { RotateCcw } from '@lucide/vue';
import { useUserSetting } from '../composables/useUserSetting';
import type { UserSettingPreferences } from '@memoflow/contracts/setting';

const { t } = useI18n();
const { resetToDefaults, userSetting } = useUserSetting();

type ResetTarget = 'all' | Extract<keyof UserSettingPreferences, string>;
const target = ref<ResetTarget>('all');
const resetting = ref(false);

const categories: ResetTarget[] = ['all', 'appearance', 'locale', 'privacy', 'experimental'];

const theme = computed(() => userSetting.value?.preferences?.appearance?.theme);

async function handleReset() {
  resetting.value = true;
  try {
    await resetToDefaults(target.value === 'all' ? undefined : (target.value as never));
  } finally {
    resetting.value = false;
  }
}
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
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1 text-sm">
          <p class="text-muted-foreground">{{ t('setting.resetPreferences.currentTheme') }}</p>
          <p class="font-medium" data-testid="settings-reset-current-theme">
            {{ theme ?? t('setting.resetPreferences.themeUnknown') }}
          </p>
        </div>
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
            <option v-for="category in categories" :key="category" :value="category">
              {{
                category === 'all'
                  ? t('setting.resetPreferences.categoryAll')
                  : t(`setting.resetPreferences.category${category.charAt(0).toUpperCase()}${category.slice(1)}`)
              }}
            </option>
          </select>
        </div>
        <Button
          variant="outline"
          data-testid="settings-reset-button"
          :disabled="resetting"
          @click="handleReset"
        >
          <RotateCcw class="mr-2 h-4 w-4" />
          {{ resetting ? t('setting.resetPreferences.resetting') : t('setting.resetPreferences.resetButton') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
