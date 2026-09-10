import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { fail, ok } from '@memoflow/contracts/result';
import { NOTIFICATION_SERVICE_KEY } from '../../../di/keys';
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
  globalChannels: { InApp: false, Push: false },
  workflowOverrides: { 'task.general': { InApp: true } },
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

describe('useNotificationPreferences vNext hierarchy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses workflow override first and global channel preference as fallback', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));

    const api = mountComposable();
    await api.loadPreferences();
    await flushPromises();

    expect(service.getPreferences).toHaveBeenCalledWith();
    expect(api.hasChannel('task', 'inApp')).toBe(true);
    expect(api.hasChannel('task', 'push')).toBe(false);
    expect(api.hasChannel('goal', 'inApp')).toBe(false);
    expect(NOTIFICATION_PREFERENCE_MODULES).toContain('task');
  });

  it('updates only the workflow-specific channel override without identity dual-track', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    service.updatePreferences.mockResolvedValue(
      ok({
        ...basePreference,
        workflowOverrides: { 'task.general': { InApp: true, Push: true } },
        version: 2,
        updatedAt: 2,
      } as never),
    );

    const api = mountComposable();
    await api.loadPreferences();
    const saved = await api.setModuleChannel('task', 'push', true);
    await flushPromises();

    expect(saved).toBe(true);
    expect(service.updatePreferences).toHaveBeenCalledWith({
      workflowOverrides: {
        'task.general': { InApp: true, Push: true },
      },
    });
    expect(service.updatePreferences.mock.calls[0][0]).not.toHaveProperty('identityId');
    expect(api.hasChannel('task', 'push')).toBe(true);
  });

  it('reads and writes global delivery channels through globalChannels only', async () => {
    service.getPreferences.mockResolvedValue(ok(basePreference as never));
    service.updatePreferences.mockResolvedValue(
      ok({ ...basePreference, globalChannels: { InApp: true, Push: false, Email: false } } as never),
    );

    const api = mountComposable();
    await api.loadPreferences();
    expect(api.hasGlobalChannel('inApp')).toBe(false);
    expect(await api.setGlobalChannel('email', false)).toBe(true);
    expect(service.updatePreferences).toHaveBeenCalledWith({
      globalChannels: { Email: false },
    });
  });

  it('surfaces load failures without throwing', async () => {
    service.getPreferences.mockResolvedValue(fail({ code: 'INTERNAL', message: 'boom' }));
    const api = mountComposable();
    await api.loadPreferences();
    await flushPromises();
    expect(api.error.value).toBeTruthy();
    expect(api.preference.value).toBeNull();
  });
});
