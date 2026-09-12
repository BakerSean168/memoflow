import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPinia } from '@memoflow/test-utils';
import { fail, ok } from '@memoflow/contracts/result';
import {
  DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY,
  NOTIFICATION_SERVICE_KEY,
} from '../../../di/keys';
import NotificationSettings from './NotificationSettings.vue';

const service = {
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
};
const devicePreferencePort = {
  get: vi.fn(),
  update: vi.fn(),
  reset: vi.fn(),
};

const messages = {
  setting: {
    notifications: {
      title: 'Notifications',
      description: 'desc',
      deviceTitle: 'On this device',
      presentationMode: 'Custom',
      presentationModeDescription: 'custom desc',
      soundEnabled: 'Notification sound',
      soundEnabledDescription: 'sound desc',
      deliveryTitle: 'User delivery',
      deliveryDescription: 'delivery desc',
      globalChannelsTitle: 'Global channels',
      moduleChannelsTitle: 'Module channels',
      moduleChannelsDescription: 'module desc',
      loadPreferencesFailed: 'load failed',
      updatePreferencesFailed: 'update failed',
      channels: { inApp: 'In-app', push: 'Push', email: 'Email' },
      modules: {
        task: 'Tasks',
        goal: 'Goals',
        schedule: 'Schedule',
        reminder: 'Reminders',
        account: 'Account',
        system: 'System',
      },
    },
  },
};

function mountSettings(devicePort: typeof devicePreferencePort | null = devicePreferencePort) {
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': messages } });
  return mount(NotificationSettings, {
    global: {
      plugins: [i18n, createTestPinia()],
      provide: {
        [NOTIFICATION_SERVICE_KEY as symbol]: service,
        ...(devicePort
          ? { [DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY as symbol]: devicePort }
          : {}),
      },
      stubs: {
        Card: defineComponent({
          setup(_, { slots }) {
            return () => h('div', { class: 'card' }, slots.default?.());
          },
        }),
        CardHeader: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        CardTitle: defineComponent({
          setup(_, { slots }) {
            return () => h('h3', slots.default?.());
          },
        }),
        CardDescription: defineComponent({
          setup(_, { slots }) {
            return () => h('p', slots.default?.());
          },
        }),
        CardContent: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        Label: defineComponent({
          setup(_, { slots }) {
            return () => h('label', slots.default?.());
          },
        }),
        Switch: defineComponent({
          props: {
            modelValue: { type: Boolean, default: false },
            disabled: { type: Boolean, default: false },
            id: { type: String, default: '' },
          },
          emits: ['update:modelValue'],
          setup(props, { emit, attrs }) {
            return () =>
              h('button', {
                type: 'button',
                id: props.id,
                'data-testid': attrs['data-testid'],
                'data-checked': String(props.modelValue),
                disabled: props.disabled,
                onClick: () => emit('update:modelValue', !props.modelValue),
              });
          },
        }),
      },
    },
  });
}

describe('NotificationSettings residual 199', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devicePreferencePort.get.mockResolvedValue(
      ok({ presentationMode: 'custom', soundEnabled: true }),
    );
    devicePreferencePort.update.mockResolvedValue(
      ok({ presentationMode: 'native', soundEnabled: true }),
    );
    service.getPreferences.mockResolvedValue(
      ok({
        id: 'INotificationPreferenceId_550e8400-e29b-41d4-a716-446655440000',
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        globalChannels: { InApp: false, Push: false },
        workflowOverrides: { 'task.general': { InApp: true } },
        doNotDisturb: null,
        rateLimit: null,
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      } as never),
    );
    service.updatePreferences.mockResolvedValue(
      ok({
        id: 'INotificationPreferenceId_550e8400-e29b-41d4-a716-446655440000',
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        globalChannels: { InApp: false, Push: false },
        workflowOverrides: { 'task.general': { InApp: true, Push: true } },
        doNotDisturb: null,
        rateLimit: null,
        version: 2,
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
      } as never),
    );
  });

  it('loads module channel preferences on mount without identity dual-track', async () => {
    const wrapper = mountSettings();
    await flushPromises();

    expect(service.getPreferences).toHaveBeenCalledWith();
    expect(wrapper.get('[data-testid="notification-delivery-card"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="notification-module-task"]').exists()).toBe(true);
    expect(
      wrapper.get('[data-testid="notification-channel-task-inApp"]').attributes('data-checked'),
    ).toBe('true');
    expect(
      wrapper.get('[data-testid="notification-channel-task-push"]').attributes('data-checked'),
    ).toBe('false');
  });

  it('toggles a module push channel via workflow override', async () => {
    const wrapper = mountSettings();
    await flushPromises();

    await wrapper.get('[data-testid="notification-channel-task-push"]').trigger('click');
    await flushPromises();

    expect(service.updatePreferences).toHaveBeenCalledWith({
      workflowOverrides: {
        'task.general': { InApp: true, Push: true },
      },
    });
    expect(service.updatePreferences.mock.calls[0][0]).not.toHaveProperty('identityId');
  });

  it('updates device presentation without touching UserSetting or NotificationPreference', async () => {
    const wrapper = mountSettings();
    await flushPromises();

    await wrapper.get('[data-testid="notification-settings-switch"]').trigger('click');
    await flushPromises();

    expect(devicePreferencePort.update).toHaveBeenCalledWith({ presentationMode: 'native' });
    expect(service.updatePreferences).not.toHaveBeenCalled();
  });

  it('keeps delivery settings available when the device port is absent', async () => {
    const wrapper = mountSettings(null);
    await flushPromises();

    expect(wrapper.get('[data-testid="notification-delivery-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="notification-device-card"]').exists()).toBe(false);
    expect(service.updatePreferences).not.toHaveBeenCalled();
    expect(devicePreferencePort.update).not.toHaveBeenCalled();
  });

  it('hides the device card when the device port fails to load', async () => {
    const failingDevicePort = {
      ...devicePreferencePort,
      get: vi.fn().mockResolvedValue(fail({ code: 'SERVICE_UNAVAILABLE', message: 'unavailable' })),
    };
    const wrapper = mountSettings(failingDevicePort);
    await flushPromises();

    expect(wrapper.get('[data-testid="notification-delivery-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="notification-device-card"]').exists()).toBe(false);
    expect(service.updatePreferences).not.toHaveBeenCalled();
    expect(devicePreferencePort.update).not.toHaveBeenCalled();
  });
});
