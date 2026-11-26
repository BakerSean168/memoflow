import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { screen, userEvent, waitFor } from 'storybook/test';
import { AccountSettingsSection } from '@memoflow/setting-ui';
import {
  connection,
  externalAgents,
  renderSettingsPage as renderSection,
} from './__fixtures__/settings-page';

const meta = {
  title: 'Business/Setting/AccountSettingsSection',
  component: AccountSettingsSection,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark', locale: 'zh-CN' },
} satisfies Meta<typeof AccountSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Signed-in cloud account with password management and one scoped access token. */
export const CloudAccount: Story = {
  render: () => renderSection(),
};

/** OAuth-connected external client plus a personal access token. */
export const OAuthClientConnected: Story = {
  render: () =>
    renderSection({
      external: externalAgents({ oauth: true, connections: [connection] }),
    }),
};

/** No external clients yet: both lists explain their empty state. */
export const NoExternalClients: Story = {
  render: () => renderSection({ external: externalAgents({ oauth: true, pats: [] }) }),
};

/** Password and external-agent capabilities are absent: only the account section renders. */
export const AccountOnly: Story = {
  render: () => renderSection({ auth: false, external: false }),
};

/** Desktop local account: password action, launch preference and sign-out. */
export const DesktopLocalAccount: Story = {
  render: () => renderSection({ local: true, auth: false, external: false }),
};

export const LocalPasswordDialog: Story = {
  ...DesktopLocalAccount,
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-local-password-open'));
    await screen.findByTestId('account-local-password-dialog');
  },
};

export const CloudPasswordDialog: Story = {
  render: () => renderSection({ external: false }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('cloud-password-open'));
    await screen.findByTestId('cloud-password-dialog');
  },
};

/** Full settings surface, with device navigation already opened. */
export const LoggedInDevices: Story = {
  render: () => renderSection({ external: false }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-devices-open'));
    await screen.findByTestId('account-devices-page');
  },
};

export const LightTheme: Story = {
  globals: { theme: 'light', locale: 'zh-CN' },
  render: () => renderSection({ external: false }),
};

export const NarrowAccount: Story = {
  render: () => renderSection({ external: false, narrow: true }),
};

export const ConnectedApps: Story = {
  render: () =>
    renderSection({ external: externalAgents({ oauth: true, connections: [connection] }) }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-oauth-connections-open'));
    await screen.findByTestId('account-connections-page');
  },
};

export const CreateAccessTokenDialog: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-connections-open'));
    const create = await screen.findByTestId('pat-create-open');
    await waitFor(() => {
      if ((create as HTMLButtonElement).disabled) throw new Error('Loading connections');
    });
    await userEvent.click(create);
    await screen.findByTestId('pat-create-dialog');
  },
};

export const PersonalAccessTokens: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-connections-open'));
    await screen.findByTestId('pat-create-open');
  },
};
