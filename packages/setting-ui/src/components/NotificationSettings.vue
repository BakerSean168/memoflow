<script setup lang="ts">
import { computed, onMounted, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { Switch } from '@memoflow/ui-vue-shadcn';
import { settingUiHost } from '../setting-ui-host';

const { SettingsPropertyRow, SettingsSection, SettingsStatusBlock } = settingUiHost.components;
const { t } = useI18n();
const switchId = useId();
const {
  modules,
  isLoaded,
  isLoading,
  isSaving,
  error,
  hasChannel,
  hasGlobalChannel,
  loadPreferences,
  setModuleChannel,
  setGlobalChannel,
} = settingUiHost.useNotificationPreferences();
const busy = computed(() => isLoading.value || isSaving.value);
const desktopEnabled = computed(() => hasGlobalChannel('desktop'));

onMounted(loadPreferences);
</script>

<template>
  <div class="space-y-8" data-testid="notification-settings" :aria-busy="busy">
    <SettingsStatusBlock
      v-if="isLoading && !isLoaded"
      kind="loading"
      :description="t('setting.notifications.loading')"
    />
    <SettingsStatusBlock
      v-if="error"
      kind="error"
      :description="error"
      test-id="notification-preferences-error"
    />
    <template v-if="isLoaded">
      <SettingsSection
        :title="t('setting.notifications.desktopTitle')"
        test-id="notification-delivery-card"
      >
        <SettingsPropertyRow
          :label="t('setting.notifications.desktopEnabled')"
          :description="t('setting.notifications.desktopDescription')"
          :html-for="`${switchId}-desktop`"
          layout="toggle"
        >
          <div class="flex justify-end">
            <Switch
              :id="`${switchId}-desktop`"
              data-testid="notification-global-desktop"
              :model-value="desktopEnabled"
              :disabled="busy"
              @update:model-value="(value) => setGlobalChannel('desktop', value)"
            />
          </div>
        </SettingsPropertyRow>
      </SettingsSection>

      <SettingsSection :title="t('setting.notifications.typesTitle')">
        <div class="divide-y divide-[hsl(var(--border-subtle)/0.62)]">
          <SettingsPropertyRow
            v-for="moduleName in modules"
            :key="moduleName"
            :label="t(`setting.notifications.modules.${moduleName}`)"
            :html-for="`${switchId}-${moduleName}`"
            :test-id="`notification-module-${moduleName}`"
            layout="toggle"
          >
            <div class="flex justify-end">
              <Switch
                :id="`${switchId}-${moduleName}`"
                :data-testid="`notification-channel-${moduleName}-desktop`"
                :model-value="hasChannel(moduleName, 'desktop')"
                :disabled="busy || !desktopEnabled"
                @update:model-value="(value) => setModuleChannel(moduleName, 'desktop', value)"
              />
            </div>
          </SettingsPropertyRow>
        </div>
      </SettingsSection>
    </template>
  </div>
</template>
