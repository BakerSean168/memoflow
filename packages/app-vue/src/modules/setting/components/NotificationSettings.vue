<template>
  <div class="space-y-8" data-testid="notification-settings">
    <SettingsSection
      v-if="!devicePreferencePort"
      :title="t('setting.notifications.browserTitle')"
      :description="t('setting.notifications.browserDescription')"
      test-id="notification-browser-card"
    >
      <SettingsPropertyRow
        :label="t('setting.notifications.browserSystemNotification')"
        :description="
          !browserNotificationAvailable
            ? t('setting.notifications.browserSecureContextRequired')
            : browserNotificationPermission === 'denied'
              ? t('setting.notifications.browserPermissionDenied')
              : t('setting.notifications.browserSystemNotificationDescription')
        "
        html-for="browser-notification-switch"
      >
        <div class="flex justify-end">
          <Switch
            id="browser-notification-switch"
            data-testid="notification-browser-system-switch"
            :model-value="browserNotificationEnabled"
            :disabled="
              browserNotificationBusy ||
              !browserNotificationAvailable ||
              browserNotificationPermission === 'denied'
            "
            @update:model-value="updateBrowserNotification"
          />
        </div>
      </SettingsPropertyRow>
    </SettingsSection>

    <SettingsSection
      v-if="devicePreferenceAvailable"
      :title="t('setting.notifications.deviceTitle')"
      :description="t('setting.notifications.description')"
      test-id="notification-device-card"
    >
      <SettingsPropertyRow
        :label="t('setting.notifications.presentationMode')"
        :description="t('setting.notifications.presentationModeDescription')"
        html-for="notification-switch"
      >
        <div class="flex justify-end">
          <Switch
            id="notification-switch"
            data-testid="notification-settings-switch"
            :model-value="useCustomPresentation"
            :disabled="deviceBusy"
            @update:model-value="updatePresentationMode"
          />
        </div>
      </SettingsPropertyRow>

      <SettingsPropertyRow
        :label="t('setting.notifications.soundEnabled')"
        :description="t('setting.notifications.soundEnabledDescription')"
        html-for="notification-sound-switch"
      >
        <div class="flex justify-end">
          <Switch
            id="notification-sound-switch"
            data-testid="notification-sound-switch"
            :model-value="soundEnabled"
            :disabled="deviceBusy"
            @update:model-value="updateSoundEnabled"
          />
        </div>
      </SettingsPropertyRow>
    </SettingsSection>

    <SettingsSection
      :title="t('setting.notifications.deliveryTitle')"
      :description="t('setting.notifications.deliveryDescription')"
      test-id="notification-delivery-card"
    >
      <SettingsStatusBlock
        v-if="preferenceError"
        kind="error"
        :description="preferenceError"
        test-id="notification-preferences-error"
        class="mb-4"
      />

      <SettingsPropertyRow
        :label="t('setting.notifications.globalChannelsTitle')"
        layout="stacked"
        test-id="notification-global-channels"
      >
        <div class="flex flex-wrap gap-x-5 gap-y-3">
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
      </SettingsPropertyRow>

      <div class="mt-4 divide-y divide-[hsl(var(--border-subtle)/0.72)]">
        <SettingsPropertyRow
          v-for="moduleName in modules"
          :key="moduleName"
          :label="t(`setting.notifications.modules.${moduleName}`)"
          :test-id="`notification-module-${moduleName}`"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-5">
            <div class="flex items-center justify-between gap-3 sm:justify-start">
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
            <div class="flex items-center justify-between gap-3 sm:justify-start">
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
        </SettingsPropertyRow>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label, Switch } from '@memoflow/ui-vue-shadcn';
import {
  SettingsPropertyRow,
  SettingsSection,
  SettingsStatusBlock,
} from '../../../components/shared/settings';
import { DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY } from '../../../di/keys';
import type { DesktopNotificationPreference } from '@memoflow/contracts/electron';
import {
  browserSystemNotificationPermission,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
} from '../../notification/browser-system-notification';
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
const browserNotificationAvailable = ref(isBrowserSystemNotificationSupported());
const browserNotificationEnabled = ref(false);
const browserNotificationBusy = ref(false);
const browserNotificationPermission = ref(browserSystemNotificationPermission());
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

async function updateBrowserNotification(value: boolean) {
  browserNotificationBusy.value = true;
  try {
    if (!value) {
      setBrowserSystemNotificationEnabled(false);
      browserNotificationEnabled.value = false;
      return;
    }
    browserNotificationPermission.value = await requestBrowserSystemNotificationPermission();
    browserNotificationEnabled.value =
      browserNotificationPermission.value === 'granted' && isBrowserSystemNotificationEnabled();
  } finally {
    browserNotificationBusy.value = false;
  }
}

onMounted(() => {
  browserNotificationAvailable.value = isBrowserSystemNotificationSupported();
  browserNotificationPermission.value = browserSystemNotificationPermission();
  browserNotificationEnabled.value =
    browserNotificationPermission.value === 'granted' && isBrowserSystemNotificationEnabled();

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
