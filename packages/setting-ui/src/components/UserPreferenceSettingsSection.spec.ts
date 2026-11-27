import { defineComponent, h, type PropType } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { PreferenceNamespace, UserPreferenceProfile } from '@memoflow/setting-contracts';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '@setting-ui-test-host/di/keys';
import { createI18nPlugin } from '@setting-ui-test-host/plugins/i18n';
import enUS from '@setting-ui-test-host/locales/en-US';
import UserPreferenceSettingsSection from './UserPreferenceSettingsSection.vue';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';

const canonicalProfile: UserPreferenceProfile = {
  presentation: {
    theme: 'dark',
    language: 'en-US',
    accent: 'linear-indigo',
    lightAccent: 'linear-indigo',
    darkAccent: 'linear-indigo',
  },
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
  const selected = wrapper
    .findAll<HTMLInputElement>('input[type="radio"]')
    .find((input) => input.element.checked);
  return selected?.element.value;
}

describe('UserPreferenceSettingsSection canonical ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete document.documentElement.dataset.accent;
  });

  it('renders canonical presentation/regional data without touching the legacy giant-tree API', async () => {
    const { wrapper, service } = mountSection();
    await flushPromises();

    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('presentation');
    expect(service.getPreferenceNamespace).toHaveBeenCalledWith('regional');
    expect(service.getUserSettings).not.toHaveBeenCalled();
    expect(service.getUserSettingDefaults).not.toHaveBeenCalled();
    expect(themeValue(wrapper)).toBe('dark');
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-dark-linear-indigo"]')
        .attributes('aria-checked'),
    ).toBe('true');
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-light-linear-indigo"]')
        .attributes('aria-checked'),
    ).toBe('true');
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-dark-brand-gold"]')
        .attributes('aria-checked'),
    ).toBe('false');
  });

  it('indicates the selected theme and accent through borders only, without check icons', async () => {
    const { wrapper } = mountSection();
    await flushPromises();

    const themeInputs = wrapper.findAll<HTMLInputElement>(
      '[data-testid^="appearance-theme-option-"]',
    );
    expect(themeInputs).toHaveLength(3);
    expect(
      themeInputs.every((input) => input.element.closest('label')?.querySelector('svg') == null),
    ).toBe(true);
    expect(
      themeInputs.every((input) =>
        input.element.nextElementSibling?.classList.contains('peer-checked:border-primary'),
      ),
    ).toBe(true);

    const accentButtons = wrapper.findAll('[data-testid^="appearance-accent-option-"]');
    expect(accentButtons).toHaveLength(12);
    expect(accentButtons.every((button) => button.find('svg').exists() === false)).toBe(true);
    expect(
      wrapper.get('[data-testid="appearance-accent-option-dark-linear-indigo"]').classes(),
    ).toContain('ring-2');
    expect(
      wrapper.get('[data-testid="appearance-accent-option-light-linear-indigo"]').classes(),
    ).toContain('ring-2');
  });

  it('uses canonical defaults/profile values and stays independent from legacy setting availability', async () => {
    const profile: UserPreferenceProfile = {
      presentation: {
        theme: 'auto',
        language: 'zh-CN',
        accent: 'brand-gold',
        lightAccent: 'brand-gold',
        darkAccent: 'brand-gold',
      },
      regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
    };
    const service = createService({ profile });
    const { wrapper } = mountSection(service);
    await flushPromises();

    expect(themeValue(wrapper)).toBe('auto');
    expect(service.getUserSettings).not.toHaveBeenCalled();
  });

  it('applies and persists an accent selection optimistically', async () => {
    const { wrapper, service } = mountSection();
    await flushPromises();

    await wrapper.get('[data-testid="appearance-accent-option-dark-violet"]').trigger('click');
    await flushPromises();

    expect(document.documentElement.dataset.accent).toBe('violet');
    expect(usePresentationPreferenceStore().darkAccent).toBe('violet');
    expect(service.patchPreferenceNamespace).toHaveBeenCalledWith(
      'presentation',
      { darkAccent: 'violet', accent: 'violet' },
      3,
    );
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-dark-violet"]')
        .attributes('aria-checked'),
    ).toBe('true');
  });

  it('updates non-current mode accent without switching actual appearance', async () => {
    const { wrapper, service } = mountSection();
    await flushPromises();

    // Current theme is dark with linear-indigo
    expect(document.documentElement.dataset.accent).toBe('linear-indigo');

    // Update light mode accent to ocean-blue
    await wrapper.get('[data-testid="appearance-accent-option-light-ocean-blue"]').trigger('click');
    await flushPromises();

    // Document appearance does not switch because current active mode is dark
    expect(document.documentElement.dataset.accent).toBe('linear-indigo');
    expect(usePresentationPreferenceStore().lightAccent).toBe('ocean-blue');
    expect(usePresentationPreferenceStore().darkAccent).toBe('linear-indigo');
    expect(service.patchPreferenceNamespace).toHaveBeenCalledWith(
      'presentation',
      { lightAccent: 'ocean-blue', accent: 'linear-indigo' },
      3,
    );
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-light-ocean-blue"]')
        .attributes('aria-checked'),
    ).toBe('true');
  });

  it('rolls back an optimistic accent update when the canonical mutation fails', async () => {
    const service = createService();
    service.patchPreferenceNamespace.mockResolvedValue(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'canonical down' }),
    );
    const { wrapper } = mountSection(service);
    await flushPromises();

    await wrapper.get('[data-testid="appearance-accent-option-dark-rose-red"]').trigger('click');
    await flushPromises();

    expect(document.documentElement.dataset.accent).toBe('linear-indigo');
    expect(usePresentationPreferenceStore().darkAccent).toBe('linear-indigo');
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-dark-rose-red"]')
        .attributes('aria-checked'),
    ).toBe('false');
    expect(
      wrapper
        .get('[data-testid="appearance-accent-option-dark-linear-indigo"]')
        .attributes('aria-checked'),
    ).toBe('true');
    expect(wrapper.find('[data-testid="user-preference-mutation-error"]').exists()).toBe(true);
  });

  it('contains canonical load failure inside the User Preferences section', async () => {
    const { wrapper } = mountSection(createService({ failCanonical: true }));
    await flushPromises();

    expect(wrapper.find('[data-testid="user-preference-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="appearance-settings-card"]').exists()).toBe(false);
  });
});
