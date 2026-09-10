<template>
  <div class="space-y-6" data-testid="notification-settings">
    <Card v-if="devicePreferenceAvailable" data-testid="notification-device-card">
      <CardHeader>
        <CardTitle class="text-lg font-medium">{{
          t('setting.notifications.deviceTitle')
        }}</CardTitle>
        <CardDescription>
          {{ t('setting.notifications.description') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="p-6 space-y-6">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label for="notification-switch" class="text-base font-medium">{{
              t('setting.notifications.presentationMode')
            }}</Label>
            <p class="text-[13px] text-muted-foreground max-w-sm">
              {{ t('setting.notifications.presentationModeDescription') }}
            </p>
          </div>
          <Switch
            id="notification-switch"
            data-testid="notification-settings-switch"
            :model-value="useCustomPresentation"
            :disabled="deviceBusy"
            @update:model-value="updatePresentationMode"
          />
        </div>
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label for="notification-sound-switch" class="text-base font-medium">{{
              t('setting.notifications.soundEnabled')
            }}</Label>
            <p class="text-[13px] text-muted-foreground max-w-sm">
              {{ t('setting.notifications.soundEnabledDescription') }}
            </p>
          </div>
          <Switch
            id="notification-sound-switch"
            data-testid="notification-sound-switch"
            :model-value="soundEnabled"
            :disabled="deviceBusy"
            @update:model-value="updateSoundEnabled"
          />
        </div>
      </CardContent>
    </Card>

    <Card data-testid="notification-delivery-card">
      <CardHeader>
        <CardTitle class="text-lg font-medium">{{
          t('setting.notifications.deliveryTitle')
        }}</CardTitle>
        <CardDescription>
          {{ t('setting.notifications.deliveryDescription') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="p-6 space-y-4">
        <p
          v-if="preferenceError"
          class="text-sm text-destructive"
          data-testid="notification-preferences-error"
        >
          {{ preferenceError }}
        </p>
        <div class="rounded-lg border p-4 space-y-3" data-testid="notification-global-channels">
          <p class="text-sm font-medium">{{ t('setting.notifications.globalChannelsTitle') }}</p>
          <div class="flex flex-wrap gap-4">
            <div v-for="channel in globalChannels" :key="channel" class="flex items-center gap-2">
              <Label :for="`global-${channel}`" class="text-sm">{{
                t(`setting.notifications.channels.${channel}`)
              }}</Label>
              <Switch
                :id="`global-${channel}`"
                :data-testid="`notification-global-${channel}`"
                :model-value="hasGlobalChannel(channel)"
                :disabled="preferenceBusy"
                @update:model-value="(value) => onGlobalChannelChange(channel, value)"
              />
            </div>
          </div>
        </div>
        <div
          v-for="moduleName in modules"
          :key="moduleName"
          class="rounded-lg border p-4 space-y-3"
          :data-testid="`notification-module-${moduleName}`"
        >
          <p class="text-sm font-medium">
            {{ t(`setting.notifications.modules.${moduleName}`) }}
          </p>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center justify-between gap-4 sm:justify-start">
              <Label :for="`${moduleName}-in-app`" class="text-sm">{{
                t('setting.notifications.channels.inApp')
              }}</Label>
              <Switch
                :id="`${moduleName}-in-app`"
                :data-testid="`notification-channel-${moduleName}-inApp`"
                :model-value="hasChannel(moduleName, 'inApp')"
                :disabled="preferenceBusy"
                @update:model-value="(value) => onChannelChange(moduleName, 'inApp', value)"
              />
            </div>
            <div class="flex items-center justify-between gap-4 sm:justify-start">
              <Label :for="`${moduleName}-push`" class="text-sm">{{
                t('setting.notifications.channels.push')
              }}</Label>
              <Switch
                :id="`${moduleName}-push`"
                :data-testid="`notification-channel-${moduleName}-push`"
                :model-value="hasChannel(moduleName, 'push')"
                :disabled="preferenceBusy"
                @update:model-value="(value) => onChannelChange(moduleName, 'push', value)"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@memoflow/ui-vue-shadcn';
import { Label } from '@memoflow/ui-vue-shadcn';
import { Switch } from '@memoflow/ui-vue-shadcn';
import { DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY } from '../../../di/keys';
import type { DesktopNotificationPreference } from '@memoflow/contracts/electron';
import {
  useNotificationPreferences,
  type NotificationPreferenceModule,
  type PreferenceChannelFlag,
} from '../../notification/composables/useNotificationPreferences';

const { t } = useI18n();
const devicePreferencePort = inject(DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY, null);
const devicePreference = ref<DesktopNotificationPreference>({
  presentationMode: 'custom',
  soundEnabled: true,
});
const devicePreferenceAvailable = ref(false);
const deviceBusy = ref(false);
const {
  modules,
  isLoading: preferenceLoading,
  isSaving: preferenceSaving,
  error: preferenceError,
  hasChannel,
  hasGlobalChannel,
  loadPreferences,
  setModuleChannel,
  setGlobalChannel,
} = useNotificationPreferences();

const globalChannels = ['inApp', 'push', 'email'] as const;

const preferenceBusy = computed(() => preferenceLoading.value || preferenceSaving.value);

// Use the explicit setting or default to true (custom desktop notification)
const useCustomPresentation = computed(() => devicePreference.value.presentationMode === 'custom');
const soundEnabled = computed(() => devicePreference.value.soundEnabled);

async function updatePresentationMode(value: boolean) {
  await updateDevicePreference({ presentationMode: value ? 'custom' : 'native' });
}

async function updateSoundEnabled(value: boolean) {
  await updateDevicePreference({ soundEnabled: value });
}

async function updateDevicePreference(patch: Partial<typeof devicePreference.value>) {
  if (!devicePreferencePort) return;
  deviceBusy.value = true;
  try {
    const result = await devicePreferencePort.update(patch);
    if (result.ok) devicePreference.value = result.data;
  } finally {
    deviceBusy.value = false;
  }
}

async function onChannelChange(
  moduleName: NotificationPreferenceModule,
  flag: PreferenceChannelFlag,
  value: boolean,
) {
  await setModuleChannel(moduleName, flag, value);
}

async function onGlobalChannelChange(flag: (typeof globalChannels)[number], value: boolean) {
  await setGlobalChannel(flag, value);
}

onMounted(() => {
  void loadPreferences();
  if (devicePreferencePort) {
    void devicePreferencePort.get().then((result) => {
      if (result.ok) {
        devicePreference.value = result.data;
        devicePreferenceAvailable.value = true;
      }
    });
  }
});
</script>
