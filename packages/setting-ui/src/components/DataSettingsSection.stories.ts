import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { screen, userEvent } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import { settingUiHost } from '../setting-ui-host';
import DataSettingsSection from './DataSettingsSection.vue';

const settingsService = {
  exportSettings: async () =>
    ok({ fileName: 'memoflow-preferences.json', data: '{}' }),
  importSettings: async () => ok({ applied: [], skipped: [] }),
};

function portability(exportPortableDataV3: () => Promise<unknown>) {
  return {
    exportPortableDataV3,
    dryRunPortableDataV3: async () => ok({ created: {}, updated: {} }),
    applyPortableDataV3: async () => ok({ created: {}, updated: {}, warnings: [] }),
    exportServerHeldDataDisclosure: async () =>
      ok({ fileName: 'server-data.json', content: '{}', summary: { entityCounts: {} } }),
  };
}

type Options = {
  portability?: boolean;
  desktop?: boolean;
  exportPortableDataV3?: () => Promise<unknown>;
};

function renderSection(options: Options = {}) {
  return {
    components: { DataSettingsSection },
    setup() {
      provide(settingUiHost.SETTING_SERVICE_KEY as symbol, settingsService as never);
      if (options.portability !== false) {
        provide(
          settingUiHost.DATA_PORTABILITY_SERVICE_KEY as symbol,
          portability(options.exportPortableDataV3 ?? (async () => ok({}))) as never,
        );
      }
      if (options.desktop) {
        provide(
          settingUiHost.DESKTOP_AUTH_API_KEY as symbol,
          { invoke: async () => ok({ canceled: true, filePath: null }) } as never,
        );
      }
      return {};
    },
    template: '<div style="max-width: 820px"><DataSettingsSection /></div>',
  };
}

const meta = {
  title: 'Business/Setting/DataSettingsSection',
  component: DataSettingsSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DataSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Web build: preference transfer, portable data and the server-held disclosure. */
export const Default: Story = {
  render: () => renderSection(),
};

/** Desktop build: file dialogs replace the browser download, so server disclosure is hidden. */
export const DesktopInstallation: Story = {
  render: () => renderSection({ desktop: true }),
};

/** Data portability is not wired: only preference export/import remains. */
export const PreferenceOnly: Story = {
  render: () => renderSection({ portability: false }),
};

/** Portable export in flight: the action is disabled and reports progress. */
export const ExportInProgress: Story = {
  render: () => renderSection({ exportPortableDataV3: () => new Promise(() => undefined) }),
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Export Importable Data' }));
    await screen.findByRole('button', { name: 'Exporting...' });
  },
};
