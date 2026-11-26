import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { UserSettingsView } from '@memoflow/setting-ui';
import { renderSettingsPage } from './__fixtures__/settings-page';

const meta = {
  title: 'Business/Setting/SettingsPages',
  component: UserSettingsView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark', locale: 'zh-CN' },
} satisfies Meta<typeof UserSettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AppearanceAndLanguage: Story = {
  render: () => renderSettingsPage({ initialTab: 'appearance' }),
};
export const KeyboardShortcuts: Story = {
  render: () => renderSettingsPage({ initialTab: 'shortcuts' }),
};
export const AI: Story = { render: () => renderSettingsPage({ initialTab: 'ai' }) };
export const Notifications: Story = {
  render: () => renderSettingsPage({ initialTab: 'notifications' }),
};
export const AccountAndPrivacy: Story = { render: () => renderSettingsPage() };
export const Data: Story = { render: () => renderSettingsPage({ initialTab: 'data' }) };
export const StartupAndWindow: Story = {
  render: () => renderSettingsPage({ initialTab: 'startup' }),
};
export const AboutAndUpdates: Story = {
  render: () => renderSettingsPage({ initialTab: 'updates' }),
};
export const LightAppearance: Story = {
  globals: { theme: 'light', locale: 'zh-CN' },
  render: () => renderSettingsPage({ initialTab: 'appearance', theme: 'light' }),
};
export const NarrowNotifications: Story = {
  render: () => renderSettingsPage({ initialTab: 'notifications', narrow: true }),
};
