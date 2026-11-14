import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import { settingUiHost } from '../setting-ui-host';
import UserSettingsView from './UserSettingsView.vue';

const presentation = {
  namespace: 'presentation' as const,
  preferences: {
    theme: 'light' as const,
    language: 'en-US' as const,
    accent: 'brand-gold' as const,
  },
  revision: 4,
};
const regional = {
  namespace: 'regional' as const,
  preferences: {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium' as const,
    timeStyle: '24h' as const,
    weekStartsOn: 1 as const,
  },
  revision: 2,
};

const settingService = {
  getPreferenceNamespace: async (namespace: 'presentation' | 'regional') =>
    ok(namespace === 'presentation' ? presentation : regional),
  patchPreferenceNamespace: async (
    namespace: 'presentation' | 'regional',
    patch: Record<string, unknown>,
    revision: number,
  ) =>
    ok({
      namespace,
      revision: (namespace === 'presentation' ? presentation.revision : regional.revision) + 1,
      changedKeys: Object.keys(patch),
      requestedRevision: revision,
    }),
  resetPreferenceNamespace: async (namespace: 'presentation' | 'regional', revision: number) =>
    ok({ namespace, revision: revision + 1, changedKeys: [] }),
  resetUserPreferences: async () =>
    ok({
      presentation: { revision: presentation.revision + 1, changedKeys: [] },
      regional: { revision: regional.revision + 1, changedKeys: [] },
    }),
};

async function revealNavigation(canvas: ReturnType<typeof within>) {
  const existing = canvas.queryByTestId('settings-nav-search');
  if (existing) return existing;
  await userEvent.click(canvas.getByTestId('settings-nav-trigger'));
  return canvas.findByTestId('settings-nav-search');
}

const meta = {
  title: 'Business/Setting/UserSettingsView',
  component: UserSettingsView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height: 760px;"><story /></div>' })],
  args: { initialTab: 'appearance' },
  argTypes: {
    initialTab: {
      control: 'select',
      options: ['shortcuts', 'appearance', 'repository', 'ai', 'notifications', 'account', 'data'],
    },
  },
  render: (args) => ({
    components: { UserSettingsView },
    setup() {
      provide(settingUiHost.SETTING_SERVICE_KEY as symbol, settingService as never);
      return { args };
    },
    template: '<UserSettingsView v-bind="args" />',
  }),
} satisfies Meta<typeof UserSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AppearanceSection: Story = {};

export const FilteredNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await revealNavigation(canvas);
    await userEvent.type(search, 'Keyboard');
    await expect(canvas.getByTestId('settings-tab-shortcuts')).toBeInTheDocument();
    await expect(canvas.queryByTestId('settings-tab-appearance')).not.toBeInTheDocument();
  },
};

export const KeyboardSectionWithRestore: Story = {
  args: { initialTab: 'shortcuts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('settings-breadcrumb-current')).toHaveTextContent(
      'Keyboard shortcuts',
    );
    await waitFor(() =>
      expect(canvas.getByTestId('settings-restore-defaults')).toBeInTheDocument(),
    );
  },
};
