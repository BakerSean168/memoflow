import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { UserSettingClientDTO, UserSettingPreferences } from '@memoflow/contracts/setting';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { useUserSettingStore } from '../stores/user-setting-store';
import SettingsResetSection from './SettingsResetSection.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      setting: {
        resetPreferences: {
          title: 'Reset preferences',
          description: 'Restore preferences to defaults.',
          categoryLabel: 'Category',
          categoryAll: 'All categories',
          categoryAppearance: 'Appearance',
          categoryLocale: 'Region',
          resetButton: 'Reset',
          resetting: 'Resetting...',
          currentTheme: 'Current theme',
          themeUnknown: 'Unknown',
        },
        errors: { resetFailed: 'Reset failed' },
      },
    },
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

function createSetting(
  overrides: Partial<UserSettingClientDTO> = {},
): UserSettingClientDTO {
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

function mountSection(service: { resetUserSettings: (category?: string) => Promise<unknown> }) {
  const pinia = createPinia();
  const wrapper = mount(SettingsResetSection, {
    global: {
      plugins: [pinia, i18n],
      provide: {
        [SETTING_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        Button: ButtonStub,
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        RotateCcw: true,
      },
    },
  });
  return { wrapper, pinia };
}

describe('SettingsResetSection (W6 P1-2 category reset + defaults)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the selected category to the client so a category reset leaves other categories untouched', async () => {
    // The server resets only the appearance category back to its default.
    const resetResult = createSetting({
      preferences: {
        appearance: { theme: 'auto' },
        locale: {
          language: 'en-US',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: '24H',
          weekStartsOn: 1,
        },
      } as UserSettingPreferences,
      updatedAt: 2,
    });
    const service = {
      resetUserSettings: vi.fn().mockResolvedValue(ok(resetResult)),
    };
    const { wrapper, pinia } = mountSection(service);
    useUserSettingStore(pinia).setUserSetting(createSetting());

    // Select the "appearance" category and reset it.
    await wrapper.get('[data-testid="settings-reset-category"]').setValue('appearance');
    await wrapper.get('[data-testid="settings-reset-button"]').trigger('click');
    await flushPromises();

    expect(service.resetUserSettings).toHaveBeenCalledTimes(1);
    expect(service.resetUserSettings).toHaveBeenCalledWith('appearance');

    // The returned aggregate is applied: appearance reset, others unchanged.
    const store = useUserSettingStore(pinia);
    expect(store.userSetting?.preferences?.appearance).toEqual({ theme: 'auto' });
    expect(wrapper.get('[data-testid="settings-reset-current-theme"]').text()).toBe('auto');
  });

  it('performs a full reset (no category) and renders the returned aggregate', async () => {
    const fullResetResult = createSetting({
      preferences: {
        appearance: { theme: 'auto' },
        locale: {
          language: 'en-US',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: '24H',
          weekStartsOn: 1,
        },
      } as UserSettingPreferences,
      updatedAt: 3,
    });
    const service = {
      resetUserSettings: vi.fn().mockResolvedValue(ok(fullResetResult)),
    };
    const { wrapper, pinia } = mountSection(service);
    useUserSettingStore(pinia).setUserSetting(createSetting());

    await wrapper.get('[data-testid="settings-reset-button"]').trigger('click');
    await flushPromises();

    expect(service.resetUserSettings).toHaveBeenCalledWith(undefined);
    expect(useUserSettingStore(pinia).userSetting).toEqual(fullResetResult);
    // UI reflects the returned aggregate.
    expect(wrapper.get('[data-testid="settings-reset-current-theme"]').text()).toBe('auto');
  });
});
