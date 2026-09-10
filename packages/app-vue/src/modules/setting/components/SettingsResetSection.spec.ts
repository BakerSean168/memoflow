import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import SettingsResetSection from './SettingsResetSection.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      setting: {
        resetPreferences: {
          title: 'Reset preferences',
          description: 'Reset canonical preferences.',
          categoryLabel: 'Scope',
          categoryAll: 'All user preferences',
          categoryPresentation: 'Appearance & language',
          categoryRegional: 'Region & time',
          resetButton: 'Reset',
          resetting: 'Resetting...',
          currentTheme: 'Current theme',
          themeUnknown: 'Unknown',
        },
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

function mountSection(props: { currentTheme?: 'light' | 'dark' | 'auto' | null; resetting?: boolean } = {}) {
  return mount(SettingsResetSection, {
    props,
    global: {
      plugins: [i18n],
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
}

describe('SettingsResetSection canonical reset scope', () => {
  it('renders the owner-provided current theme without reading the legacy UserSetting store', () => {
    const wrapper = mountSection({ currentTheme: 'dark' });
    expect(wrapper.get('[data-testid="settings-reset-current-theme"]').text()).toBe('dark');
  });

  it('emits presentation/regional owner reset targets', async () => {
    const wrapper = mountSection();
    await wrapper.get('[data-testid="settings-reset-category"]').setValue('presentation');
    await wrapper.get('[data-testid="settings-reset-button"]').trigger('click');
    expect(wrapper.emitted('reset')).toEqual([['presentation']]);

    await wrapper.get('[data-testid="settings-reset-category"]').setValue('regional');
    await wrapper.get('[data-testid="settings-reset-button"]').trigger('click');
    expect(wrapper.emitted('reset')).toEqual([['presentation'], ['regional']]);
  });

  it('uses all as the default owner reset scope and disables mutation while resetting', async () => {
    const wrapper = mountSection();
    await wrapper.get('[data-testid="settings-reset-button"]').trigger('click');
    expect(wrapper.emitted('reset')).toEqual([['all']]);

    await wrapper.setProps({ resetting: true });
    expect(wrapper.get('[data-testid="settings-reset-button"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Resetting...');
  });
});
