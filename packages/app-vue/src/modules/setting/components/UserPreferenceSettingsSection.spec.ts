import { defineComponent, h, type PropType } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type {
  PreferenceNamespace,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { createI18nPlugin } from '../../../plugins/i18n';
import enUS from '../../../locales/en-US';
import UserPreferenceSettingsSection from './UserPreferenceSettingsSection.vue';

const canonicalProfile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

const SelectStub = defineComponent({
  props: {
    modelValue: { type: [String, Number] as PropType<string | number>, default: undefined },
  },
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'select-model-value',
        'data-value': props.modelValue == null ? '' : String(props.modelValue),
      });
  },
});

const PassthroughStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

function createService(options?: { failCanonical?: boolean; profile?: UserPreferenceProfile }) {
  const profile = options?.profile ?? canonicalProfile;
  return {
    getPreferenceProfile: vi.fn().mockResolvedValue(ok(profile)),
    getPreferenceNamespace: vi.fn(async (namespace: PreferenceNamespace) => {
      if (options?.failCanonical) {
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'canonical down' });
      }
      return ok(
        namespace === 'presentation'
          ? { namespace, preferences: profile.presentation, revision: 3 }
          : { namespace, preferences: profile.regional, revision: 4 },
      );
    }),
    patchPreferenceNamespace: vi
      .fn()
      .mockResolvedValue(ok({ namespace: 'presentation', revision: 4, changedKeys: [] })),
    resetPreferenceNamespace: vi
      .fn()
      .mockResolvedValue(ok({ namespace: 'presentation', revision: 5, changedKeys: [] })),
    resetUserPreferences: vi.fn().mockResolvedValue(
      ok({
        presentation: { namespace: 'presentation', revision: 5, changedKeys: [] },
        regional: { namespace: 'regional', revision: 6, changedKeys: [] },
      }),
    ),
    getUserSettings: vi.fn().mockRejectedValue(new Error('legacy giant-tree must not load')),
    getUserSettingDefaults: vi.fn(),
    patchCategory: vi.fn(),
    resetUserSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
  };
}

function mountSection(service = createService()) {
  const pinia = createTestPinia();
  const i18n = createI18nPlugin('en-US', enUS as Record<string, unknown>);
  const wrapper = mount(UserPreferenceSettingsSection, {
    global: {
      plugins: [pinia, i18n],
      provide: { [SETTING_SERVICE_KEY as symbol]: service },
      stubs: {
        Select: SelectStub,
        SelectTrigger: PassthroughStub,
        SelectContent: PassthroughStub,
        SelectItem: PassthroughStub,
        SelectValue: PassthroughStub,
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        Label: PassthroughStub,
        Button: PassthroughStub,
        RotateCcw: true,
      },
    },
  });
  return { wrapper, service };
}

function themeValue(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .get('[data-testid="appearance-settings-card"]')
    .get('[data-testid="select-model-value"]')
    .attributes('data-value');
}

describe('UserPreferenceSettingsSection canonical ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders canonical presentation/regional data without touching the legacy giant-tree API', async () => {
    const { wrapper, service } = mountSection();
    await flushPromises();

    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('presentation');
    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('regional');
    expect(service.getUserSettings).not.toHaveBeenCalled();
    expect(service.getUserSettingDefaults).not.toHaveBeenCalled();
    expect(themeValue(wrapper)).toBe('dark');
  });

  it('uses canonical defaults/profile values and stays independent from legacy setting availability', async () => {
    const profile: UserPreferenceProfile = {
      presentation: { theme: 'auto', language: 'zh-CN' },
      regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
    };
    const service = createService({ profile });
    const { wrapper } = mountSection(service);
    await flushPromises();

    expect(themeValue(wrapper)).toBe('auto');
    expect(service.getUserSettings).not.toHaveBeenCalled();
  });

  it('contains canonical load failure inside the User Preferences section', async () => {
    const { wrapper } = mountSection(createService({ failCanonical: true }));
    await flushPromises();

    expect(wrapper.find('[data-testid="user-preference-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="appearance-settings-card"]').exists()).toBe(false);
  });
});
