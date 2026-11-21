import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPinia } from '@memoflow/test-utils';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { NOTIFICATION_SERVICE_KEY } from '@setting-ui-test-host/di/keys';
import { installNotificationUiHost } from '@setting-ui-test-host/di/notification-ui-host';
import enUS from '@setting-ui-test-host/locales/en-US';
import NotificationSettings from './NotificationSettings.vue';

installNotificationUiHost();
const service = { getPreferences: vi.fn(), updatePreferences: vi.fn() };
const initial = () => ({
  globalChannels: { Desktop: true },
  workflowOverrides: { 'task.general': { Desktop: false }, 'routine.general': { Desktop: true } },
});
let preference = initial();
function mountSettings() {
  return mount(NotificationSettings, {
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } }),
        createTestPinia(),
      ],
      provide: { [NOTIFICATION_SERVICE_KEY as symbol]: service },
    },
  });
}

describe('NotificationSettings desktop controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preference = initial();
    service.getPreferences.mockResolvedValue(ok(preference));
    service.updatePreferences.mockImplementation(async (patch) => {
      preference = {
        ...preference,
        globalChannels: { ...preference.globalChannels, ...patch.globalChannels },
        workflowOverrides: { ...preference.workflowOverrides, ...patch.workflowOverrides },
      };
      return ok(preference);
    });
  });

  it('renders the master and five actual workflow groups', async () => {
    const wrapper = mountSettings();
    await flushPromises();
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(6);
    expect(
      wrapper
        .get('[data-testid="notification-channel-routine-desktop"]')
        .attributes('aria-checked'),
    ).toBe('true');
    expect(
      wrapper.get('[data-testid="notification-channel-task-desktop"]').attributes('aria-checked'),
    ).toBe('false');
  });

  it('pauses desktop delivery without clearing category choices and restores them on resume', async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const master = wrapper.get('[data-testid="notification-global-desktop"]');
    await master.trigger('click');
    await flushPromises();
    const routine = wrapper.get('[data-testid="notification-channel-routine-desktop"]');
    expect(routine.attributes('aria-checked')).toBe('true');
    expect(routine.attributes('disabled')).toBeDefined();
    expect(service.updatePreferences).toHaveBeenLastCalledWith({
      globalChannels: { Desktop: false },
    });
    await master.trigger('click');
    await flushPromises();
    expect(routine.attributes('disabled')).toBeUndefined();
    expect(
      wrapper.get('[data-testid="notification-channel-task-desktop"]').attributes('aria-checked'),
    ).toBe('false');
  });

  it('writes the routine group to the real Desktop channel', async () => {
    const wrapper = mountSettings();
    await flushPromises();
    await wrapper.get('[data-testid="notification-channel-routine-desktop"]').trigger('click');
    await flushPromises();
    expect(service.updatePreferences).toHaveBeenCalledWith({
      workflowOverrides: { 'routine.general': { Desktop: false } },
    });
  });

  it('shows a persistence error and keeps the saved switch value', async () => {
    service.updatePreferences.mockResolvedValue(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'offline' }),
    );
    const wrapper = mountSettings();
    await flushPromises();
    await wrapper.get('[data-testid="notification-global-desktop"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="notification-preferences-error"]').text()).toContain(
      'offline',
    );
    expect(
      wrapper.get('[data-testid="notification-global-desktop"]').attributes('aria-checked'),
    ).toBe('true');
  });

  it('does not offer writable defaults after a failed initial load', async () => {
    service.getPreferences.mockResolvedValue(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'offline' }),
    );
    const wrapper = mountSettings();
    await flushPromises();
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="notification-preferences-error"]').text()).toContain(
      'offline',
    );
  });
});
