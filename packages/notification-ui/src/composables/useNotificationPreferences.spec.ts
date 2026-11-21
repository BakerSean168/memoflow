import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { NOTIFICATION_SERVICE_KEY } from '@notification-ui-test-host/di/keys';
import {
  NOTIFICATION_PREFERENCE_MODULES,
  useNotificationPreferences,
} from './useNotificationPreferences';

const service = {
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
};

const basePreference = {
  id: 'INotificationPreferenceId_550e8400-e29b-41d4-a716-446655440000',
  identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
  globalChannels: { InApp: false, Desktop: false },
  workflowOverrides: { 'task.general': { InApp: true, Desktop: false } },
  doNotDisturb: null,
  rateLimit: null,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
} as const;

function mountComposable() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        setting: {
          notifications: {
            loadPreferencesFailed: 'load failed',
            updatePreferencesFailed: 'update failed',
          },
        },
      },
    },
  });

  let api: ReturnType<typeof useNotificationPreferences> | null = null;
  const Host = defineComponent({
    setup() {
      api = useNotificationPreferences();
      return () => h('div');
    },
  });

  mount(Host, {
    global: {
      plugins: [i18n],
      provide: { [NOTIFICATION_SERVICE_KEY as symbol]: service },
    },
  });

  if (!api) throw new Error('composable not mounted');
  return api;
}

describe('Desktop notification preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps category choices independent from the disabled desktop master', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    const api = mountComposable();
    await api.loadPreferences();
    expect(api.hasGlobalChannel('desktop')).toBe(false);
    expect(api.hasChannel('task', 'desktop')).toBe(false);
    expect(api.hasChannel('routine', 'desktop')).toBe(true);
    expect(NOTIFICATION_PREFERENCE_MODULES).toContain('routine');
  });

  it('writes Desktop under the workflow group and preserves unrelated stored values', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    service.updatePreferences.mockResolvedValue(
      ok({
        ...basePreference,
        workflowOverrides: { 'task.general': { InApp: true, Desktop: true } },
      } as never),
    );
    const api = mountComposable();
    await api.loadPreferences();
    expect(await api.setModuleChannel('task', 'desktop', true)).toBe(true);
    expect(service.updatePreferences).toHaveBeenCalledWith({
      workflowOverrides: { 'task.general': { InApp: true, Desktop: true } },
    });
    expect(api.hasChannel('task', 'desktop')).toBe(true);
  });

  it('only patches Desktop when resuming the master, without rewriting category choices', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    service.updatePreferences.mockResolvedValue(
      ok({ ...basePreference, globalChannels: { Desktop: true } } as never),
    );
    const api = mountComposable();
    await api.loadPreferences();
    expect(await api.setGlobalChannel('desktop', true)).toBe(true);
    expect(service.updatePreferences).toHaveBeenCalledWith({ globalChannels: { Desktop: true } });
    expect(api.hasChannel('task', 'desktop')).toBe(false);
    expect(api.hasChannel('routine', 'desktop')).toBe(true);
  });

  it('keeps the last saved value when persistence fails', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    service.updatePreferences.mockRejectedValue(new Error('offline'));
    const api = mountComposable();
    await api.loadPreferences();
    expect(await api.setGlobalChannel('desktop', true)).toBe(false);
    expect(api.hasGlobalChannel('desktop')).toBe(false);
    expect(api.error.value).toBe('offline');
    expect(api.isSaving.value).toBe(false);
  });

  it('surfaces load failures and prevents saving unknown defaults', async () => {
    service.getPreferences.mockResolvedValue(fail({ code: 'INTERNAL', message: 'boom' }));
    const api = mountComposable();
    await api.loadPreferences();
    await flushPromises();
    expect(api.error.value).toBeTruthy();
    expect(api.isLoaded.value).toBe(false);
    expect(await api.setGlobalChannel('desktop', true)).toBe(false);
    expect(service.updatePreferences).not.toHaveBeenCalled();
  });
});
