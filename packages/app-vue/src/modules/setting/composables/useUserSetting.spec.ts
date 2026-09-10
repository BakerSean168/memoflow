import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { UserSettingClientDTO, UserSettingPreferences } from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useUserSettingStore } from '../stores/user-setting-store';
import { useUserSetting } from './useUserSetting';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: {
        operationFailed: 'Operation failed',
      },
      setting: {
        errors: {
          loadFailed: 'Load failed',
          loadDefaultsFailed: 'Load defaults failed',
          updateFailed: 'Update failed',
          resetFailed: 'Reset failed',
          exportFailed: 'Export failed',
          importFailed: 'Import failed',
        },
      },
    },
  },
});

function createSetting(overrides: Partial<UserSettingClientDTO> = {}): UserSettingClientDTO {
  return {
    id: 'setting-1' as UserSettingClientDTO['id'],
    identityId: 'identity-1' as UserSettingClientDTO['identityId'],
    preferences: {
      appearance: { theme: 'dark' },
      locale: {
        language: 'en-US',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24H',
        weekStartsOn: 1,
      },
    } as UserSettingPreferences,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as UserSettingClientDTO;
}

function mountComposable(
  serviceOverrides: Partial<{
    getUserSettings: () => Promise<unknown>;
    getUserSettingDefaults: () => Promise<unknown>;
    patchCategory: (category: string, patch: Record<string, unknown>) => Promise<unknown>;
    resetUserSettings: () => Promise<unknown>;
    exportSettings: () => Promise<unknown>;
    importSettings: (data: string) => Promise<unknown>;
  }> = {},
) {
  let composable!: ReturnType<typeof useUserSetting>;
  const service = {
    getUserSettings: vi.fn(),
    getUserSettingDefaults: vi.fn(),
    patchCategory: vi.fn(),
    resetUserSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    ...serviceOverrides,
  };

  mount(
    defineComponent({
      setup() {
        composable = useUserSetting();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [i18n],
        provide: {
          [SETTING_SERVICE_KEY as symbol]: service,
        },
      },
    },
  );

  return { composable, service };
}

describe('useUserSetting', () => {
  beforeEach(() => {
    createTestPinia();
    vi.clearAllMocks();
  });

  it('unwraps successful settings results before hydrating the store', async () => {
    const setting = createSetting({
      preferences: {
        ...createSetting().preferences,
        appearance: { theme: 'light' },
      } as UserSettingPreferences,
    });
    const { composable, service } = mountComposable({
      getUserSettings: vi.fn().mockResolvedValue(ok(setting)),
    });

    await composable.loadSettings();

    const userSettingStore = useUserSettingStore();
    expect(service.getUserSettings).toHaveBeenCalledTimes(1);
    expect(userSettingStore.userSetting).toEqual(setting);
  });

  it('unwraps successful patch results before updating derived state', async () => {
    const initial = createSetting();
    const updated = createSetting({
      preferences: {
        ...initial.preferences,
      } as UserSettingPreferences,
      updatedAt: 2,
    });
    const { composable, service } = mountComposable({
      patchCategory: vi.fn().mockResolvedValue(ok(updated)),
    });

    useUserSettingStore().setUserSetting(initial);

    const result = await composable.updateCategory('appearance', { theme: 'dark' });

    expect(service.patchCategory).toHaveBeenCalledWith('appearance', { theme: 'dark' });
    expect(result).toEqual(updated);
    expect(useUserSettingStore().userSetting).toEqual(updated);
  });

  it('hydrates the defaults from the service and exposes them through the store', async () => {
    const defaults = createSetting({
      id: 'setting-defaults' as UserSettingClientDTO['id'],
      preferences: {
        ...createSetting().preferences,
        appearance: { theme: 'auto' },
      } as UserSettingPreferences,
    });
    const { composable, service } = mountComposable({
      getUserSettingDefaults: vi.fn().mockResolvedValue(ok(defaults)),
    });

    await composable.loadDefaults();

    expect(service.getUserSettingDefaults).toHaveBeenCalledTimes(1);
    expect(useUserSettingStore().defaults).toEqual(defaults);
  });

  it('falls back to defaults for unset preference keys', async () => {
    const defaults = createSetting({
      id: 'setting-defaults' as UserSettingClientDTO['id'],
      preferences: {
        ...createSetting().preferences,
        appearance: { theme: 'auto' },
      } as UserSettingPreferences,
    });
    const { composable } = mountComposable({
      getUserSettingDefaults: vi.fn().mockResolvedValue(ok(defaults)),
    });

    await composable.loadDefaults();
    // Simulate a user with no persisted setting record.
    useUserSettingStore().setUserSetting(null);

    expect(useUserSettingStore().userSetting).toBeNull();
    expect(composable.getValue('appearance.theme')).toBe('auto');
    expect(composable.getCategory('appearance')).toEqual({ theme: 'auto' });
  });

  it('returns the V3 export artifact from the setting client', async () => {
    const artifact = {
      data: JSON.stringify({
        schemaVersion: 3,
        exportedAt: '2026-09-10T05:00:00.000Z',
        preferences: {
          presentation: { theme: 'dark', language: 'en-US' },
          regional: {
            timeZone: 'Asia/Tokyo',
            dateStyle: 'long',
            timeStyle: '12h',
            weekStartsOn: 0,
          },
        },
      }),
      fileName: 'memoflow-settings.json',
    };
    const { composable, service } = mountComposable({
      exportSettings: vi.fn().mockResolvedValue(ok(artifact)),
    });

    await expect(composable.exportSettings()).resolves.toEqual(artifact);
    expect(service.exportSettings).toHaveBeenCalledTimes(1);
  });

  it('serializes V3 import data once and returns the canonical receipt without hydrating legacy state', async () => {
    const payload = {
      schemaVersion: 3,
      exportedAt: '2026-09-10T05:00:00.000Z',
      preferences: {
        presentation: { theme: 'dark', language: 'en-US' },
        regional: {
          timeZone: 'Asia/Tokyo',
          dateStyle: 'long',
          timeStyle: '12h',
          weekStartsOn: 0,
        },
      },
    };
    const receipt = { schemaVersion: 3, imported: 2, skipped: 0, warnings: [] };
    const initial = createSetting();
    const { composable, service } = mountComposable({
      importSettings: vi.fn().mockResolvedValue(ok(receipt)),
    });
    useUserSettingStore().setUserSetting(initial);

    await expect(composable.importSettings(payload)).resolves.toEqual(receipt);
    expect(service.importSettings).toHaveBeenCalledWith(JSON.stringify(payload));
    expect(useUserSettingStore().userSetting).toEqual(initial);
  });

});
