import { defineComponent, h, type PropType } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type {
  PreferenceNamespace,
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
  UserSettingClientDTO,
  UserSettingPreferences,
} from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { createI18nPlugin } from '../../../plugins/i18n';
import enUS from '../../../locales/en-US';
import UserSettingsView from './UserSettingsView.vue';

const routerMocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn(async () => undefined),
  resolve: vi.fn(() => ({ href: '/settings?tab=appearance' })),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routerMocks.query }),
  useRouter: () => ({ replace: routerMocks.replace, resolve: routerMocks.resolve }),
}));

const canonicalProfile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

function legacySetting(theme: 'light' | 'dark' = 'light'): UserSettingClientDTO {
  return {
    id: 'setting-1' as UserSettingClientDTO['id'],
    identityId: 'identity-1' as UserSettingClientDTO['identityId'],
    preferences: {
      appearance: { theme },
      locale: {
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24H',
        weekStartsOn: 1,
      },
    } as UserSettingPreferences,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  } as UserSettingClientDTO;
}

function namespaceResponse(namespace: PreferenceNamespace): PreferenceNamespaceResponse {
  return namespace === 'presentation'
    ? { namespace, preferences: canonicalProfile.presentation, revision: 3 }
    : { namespace, preferences: canonicalProfile.regional, revision: 4 };
}

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

function createService(options?: { legacyFails?: boolean; profile?: UserPreferenceProfile }) {
  const profile = options?.profile ?? canonicalProfile;
  return {
    getPreferenceProfile: vi.fn().mockResolvedValue(ok(profile)),
    getPreferenceNamespace: vi.fn(async (namespace: PreferenceNamespace) =>
      ok(
        namespace === 'presentation'
          ? { namespace, preferences: profile.presentation, revision: 3 }
          : { namespace, preferences: profile.regional, revision: 4 },
      ),
    ),
    patchPreferenceNamespace: vi
      .fn()
      .mockResolvedValue(ok({ namespace: 'presentation', revision: 4, changedKeys: [] })),
    resetPreferenceNamespace: vi.fn(),
    resetUserPreferences: vi.fn(),
    getUserSettings: vi
      .fn()
      .mockResolvedValue(
        options?.legacyFails
          ? fail({ code: 'SERVICE_UNAVAILABLE', message: 'legacy down' })
          : ok(legacySetting('light')),
      ),
    getUserSettingDefaults: vi.fn(),
    patchCategory: vi.fn(),
    resetUserSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
  };
}

function mountSettingsPage(service = createService()) {
  const pinia = createTestPinia();
  const i18n = createI18nPlugin('en-US', enUS as Record<string, unknown>);
  const wrapper = mount(
    defineComponent({
      setup: () => () => h(UserSettingsView),
    }),
    {
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
          CardHeader: PassthroughStub,
          CardTitle: PassthroughStub,
          Label: PassthroughStub,
        },
      },
    },
  );
  return { wrapper, service };
}

function themeValue(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .get('[data-testid="appearance-settings-card"]')
    .get('[data-testid="select-model-value"]')
    .attributes('data-value');
}

describe('UserSettingsView canonical presentation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.query = { tab: 'appearance' };
  });

  it('renders canonical presentation even when legacy appearance disagrees', async () => {
    const { wrapper, service } = mountSettingsPage();
    await flushPromises();

    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('presentation');
    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('regional');
    expect(themeValue(wrapper)).toBe('dark');
    expect(service.getUserSettingDefaults).not.toHaveBeenCalled();
  });

  it('uses canonical virtual defaults rather than a fake UserSetting defaults DTO', async () => {
    const profile: UserPreferenceProfile = {
      presentation: { theme: 'auto', language: 'zh-CN' },
      regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
    };
    const service = createService({ profile });
    service.getPreferenceNamespace.mockImplementation(async (namespace: PreferenceNamespace) =>
      ok({
        ...namespaceResponse(namespace),
        preferences: profile[namespace],
        revision: 0,
      } as never),
    );
    const { wrapper } = mountSettingsPage(service);
    await flushPromises();

    expect(themeValue(wrapper)).toBe('auto');
    expect(service.getUserSettingDefaults).not.toHaveBeenCalled();
  });

  it('keeps General usable when the unrelated legacy giant-tree request fails', async () => {
    const { wrapper } = mountSettingsPage(createService({ legacyFails: true }));
    await flushPromises();

    expect(wrapper.find('[data-testid="appearance-settings-card"]').exists()).toBe(true);
    expect(themeValue(wrapper)).toBe('dark');
  });
});
