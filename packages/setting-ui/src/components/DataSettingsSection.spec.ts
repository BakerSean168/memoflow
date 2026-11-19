import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { DESKTOP_AUTH_API_KEY, SETTING_SERVICE_KEY } from '@setting-ui-test-host/di/keys';
import DataSettingsSection from './DataSettingsSection.vue';
import SettingAdvancedActions from './SettingAdvancedActions.vue';

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const messages = {
  setting: {
    advanced: {
      title: 'Data Transfer',
      preferenceDataDescription: 'Preference data only.',
      exportSettings: 'Export Preferences',
      importSettings: 'Import Preferences',
      exportPortableData: 'Export Importable Data',
      exportingPortableData: 'Exporting...',
      importPortableData: 'Import Data File',
      importingPortableData: 'Importing...',
      portableDataDescription: 'Importable data backup.',
      exportServerDataDisclosure: 'Download Server-held Data Disclosure',
      exportingServerDataDisclosure: 'Preparing disclosure...',
      serverDataDisclosureDescription: 'Server-held data.',
      preferenceFileUnreadable: 'Could not read the selected file.',
      preferenceContentInvalid: 'The selected file is not a valid settings file.',
    },
    errors: { importFailed: 'Import failed' },
  },
};

function mountSection(invoke: (channel: string) => Promise<unknown>) {
  const service = {
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
  };
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': messages } });
  const wrapper = mount(DataSettingsSection, {
    global: {
      plugins: [i18n],
      provide: {
        [SETTING_SERVICE_KEY as symbol]: service,
        [DESKTOP_AUTH_API_KEY as symbol]: { invoke },
      },
    },
  });
  return { wrapper, service };
}

async function triggerPreferenceImport(wrapper: ReturnType<typeof mount>) {
  wrapper.findComponent(SettingAdvancedActions).vm.$emit('import');
  await flushPromises();
}

describe('DataSettingsSection preference import failure outlets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports an unreadable file without attempting to import it', async () => {
    const invoke = vi.fn(async () => fail({ code: 'IO_ERROR', message: 'cannot read the file' }));
    const { wrapper, service } = mountSection(invoke);
    await flushPromises();

    await triggerPreferenceImport(wrapper);

    expect(invoke).toHaveBeenCalledWith(SystemChannels.USER_FILES_OPEN_TEXT, expect.anything());
    expect(toast.error).toHaveBeenCalledWith('Could not read the selected file.');
    expect(service.importSettings).not.toHaveBeenCalled();
  });

  it('reports invalid JSON content distinctly from file read errors', async () => {
    const invoke = vi.fn(async () => ok({ canceled: false, content: '{"schemaVersion":3' }));
    const { wrapper, service } = mountSection(invoke);
    await flushPromises();

    await triggerPreferenceImport(wrapper);

    expect(toast.error).toHaveBeenCalledWith('The selected file is not a valid settings file.');
    expect(service.importSettings).not.toHaveBeenCalled();
  });

  it('surfaces the portability error when the parsed payload is rejected', async () => {
    const invoke = vi.fn(async () => ok({ canceled: false, content: '{"schemaVersion":3}' }));
    const { wrapper, service } = mountSection(invoke);
    service.importSettings.mockResolvedValueOnce(
      fail({ code: 'VALIDATION_ERROR', message: 'unsupported schema' }),
    );
    await flushPromises();

    await triggerPreferenceImport(wrapper);

    expect(service.importSettings).toHaveBeenCalledWith('{"schemaVersion":3}');
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
