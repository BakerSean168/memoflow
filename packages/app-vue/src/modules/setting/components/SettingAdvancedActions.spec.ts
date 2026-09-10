import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import SettingAdvancedActions from './SettingAdvancedActions.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      setting: {
        advanced: {
          title: 'Data Transfer',
          preferenceDataDescription: 'V3 preference data only.',
          exportSettings: 'Export Preferences',
          importSettings: 'Import Preferences',
          exportPortableData: 'Export Importable Data',
          exportingPortableData: 'Exporting...',
          importPortableData: 'Import Data File',
          importingPortableData: 'Importing...',
          portableDataDescription: 'Importable business data backup.',
          exportServerDataDisclosure: 'Download Server-held Data Disclosure',
          exportingServerDataDisclosure: 'Preparing disclosure...',
          serverDataDisclosureDescription: 'Non-importable server-held data.',
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

function mountActions(dataPortabilityAvailable: boolean, serverDataDisclosureAvailable = false) {
  return mount(SettingAdvancedActions, {
    props: {
      dataPortabilityAvailable,
      serverDataDisclosureAvailable,
      exportingServerDataDisclosure: false,
      exportingData: false,
      importingData: false,
      dataPortabilityResult: null,
    },
    global: {
      plugins: [i18n],
      stubs: {
        Card: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        CardContent: PassthroughStub,
        Button: ButtonStub,
        DatabaseBackup: true,
        Download: true,
        Upload: true,
      },
    },
  });
}

describe('SettingAdvancedActions owner-backed data actions', () => {
  it('keeps V3 preference export/import visible without inventing fake advanced capabilities', () => {
    const wrapper = mountActions(false);

    expect(wrapper.text()).toContain('Export Preferences');
    expect(wrapper.text()).toContain('Import Preferences');
    expect(wrapper.text()).not.toContain('Export CSV');
    expect(wrapper.text()).not.toContain('Create Backup');
    expect(wrapper.text()).not.toContain('Cloud Sync');
    expect(wrapper.text()).not.toContain('Version History');
  });

  it('shows full data export/import only when Data Portability is available', () => {
    const wrapper = mountActions(true);

    expect(wrapper.text()).toContain('Export Importable Data');
    expect(wrapper.text()).toContain('Import Data File');
    expect(wrapper.get('[data-testid="portable-data-scope"]').text()).toContain(
      'Importable business data backup',
    );
  });

  it('shows the distinct non-importable server-held disclosure only when available', () => {
    const wrapper = mountActions(true, true);

    expect(wrapper.text()).toContain('Download Server-held Data Disclosure');
    expect(wrapper.get('[data-testid="server-data-scope"]').text()).toContain(
      'Non-importable server-held data',
    );
  });
});
