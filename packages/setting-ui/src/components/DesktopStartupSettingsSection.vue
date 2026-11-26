<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Switch } from '@memoflow/ui-vue-shadcn';
import type { DesktopStartupPatch, DesktopStartupSnapshot } from '@memoflow/desktop-contracts';
import { settingUiHost } from '../setting-ui-host';

const { t } = useI18n();
const { SettingsSection, SettingsPropertyRow } = settingUiHost.components;
const service = settingUiHost.useStrictInject(
  settingUiHost.DESKTOP_STARTUP_SERVICE_KEY,
  'DesktopStartupService',
);
const snapshot = ref<DesktopStartupSnapshot | null>(null);
const pending = ref(false);
const error = ref(false);
let unsubscribe: (() => void) | undefined;

async function load() {
  try {
    const result = await service.get();
    if (result.ok) snapshot.value = result.data;
    else {
      snapshot.value = null;
      error.value = true;
    }
  } catch {
    snapshot.value = null;
    error.value = true;
  }
}
async function update(key: keyof DesktopStartupPatch, value: boolean) {
  if (pending.value) return;
  pending.value = true;
  error.value = false;
  try {
    const result = await service.update({ [key]: value });
    if (result.ok) {
      snapshot.value = result.data.snapshot;
      error.value = !result.data.success;
    } else {
      error.value = true;
      await load();
    }
  } catch {
    error.value = true;
    await load();
  } finally {
    pending.value = false;
  }
}
onMounted(() => {
  unsubscribe = service.subscribe((next) => {
    snapshot.value = next;
  });
  void load();
});
onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
  <SettingsSection :title="t('setting.startup.title')" test-id="desktop-startup-settings-section">
    <p v-if="error" role="alert" class="text-sm text-destructive" data-testid="startup-error">
      {{ t('setting.startup.failure') }}
    </p>
    <p v-if="snapshot && !snapshot.autoLaunch.available" class="text-sm text-muted-foreground">
      {{ t('setting.startup.unavailable') }}
    </p>
    <SettingsPropertyRow
      v-for="key in ['autoLaunch', 'startHidden', 'closeToTray'] as const"
      :key="key"
      :label="t(`setting.startup.${key}`)"
      :html-for="`startup-${key}`"
      layout="toggle"
    >
      <Switch
        :id="`startup-${key}`"
        :data-testid="`startup-${key}`"
        :model-value="
          key === 'autoLaunch'
            ? (snapshot?.autoLaunch.enabled ?? false)
            : (snapshot?.[key] ?? false)
        "
        :disabled="
          pending ||
          !snapshot ||
          (key !== 'closeToTray' &&
            (!snapshot.autoLaunch.available ||
              (key === 'startHidden' && !snapshot.autoLaunch.enabled)))
        "
        @update:model-value="update(key, $event)"
      />
    </SettingsPropertyRow>
  </SettingsSection>
</template>
