import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { ok } from '@memoflow/transport-contracts/result';
import { screen, userEvent } from 'storybook/test';
import { accountUiHost } from '../../account-ui-host';
import ExternalAgentConnectionsSection from './ExternalAgentConnectionsSection.vue';

const pat = {
  id: 'pat-demo',
  name: 'Daily notes agent',
  prefix: 'mfp_Demo123',
  audience: 'https://api.example.invalid/mcp',
  scopes: ['goals:read', 'tasks:read'],
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2027-10-01T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
};

const connection = {
  id: 'connection-demo',
  name: 'Claude Desktop',
  clientId: 'client-demo',
  scopes: ['goals:read', 'notifications:read'],
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: '2026-11-20T00:00:00.000Z',
  expiresAt: '2027-09-01T00:00:00.000Z',
  revokedAt: null,
};

type Options = { oauth?: boolean; pats?: unknown[]; connections?: unknown[] };

function renderSection(options: Options = {}) {
  return {
    components: { ExternalAgentConnectionsSection },
    setup() {
      provide(
        accountUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol,
        {
          capabilities: async () => ok({ oauth: options.oauth ?? false }),
          listPats: async () => ok(options.pats ?? [pat]),
          listConnections: async () => ok(options.connections ?? []),
          createPat: async () =>
            ok({ ...pat, id: 'pat-created', name: 'Demo CLI', secret: 'mfp_demo_invalid_secret' }),
          revokePat: async () => ok(undefined),
          revokeConnection: async () => ok(undefined),
          consentRequest: async () => ok(undefined),
          decideConsent: async () => ok(undefined),
        } as never,
      );
      return {};
    },
    template: '<div style="max-width: 720px"><ExternalAgentConnectionsSection /></div>',
  };
}

const meta = {
  title: 'Business/Account/ExternalAgentConnectionsSection',
  component: ExternalAgentConnectionsSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ExternalAgentConnectionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** OAuth client connected and one live personal access token. */
export const OAuthConnected: Story = {
  render: () => renderSection({ oauth: true, connections: [connection] }),
};

/** Token creation form open; selecting a write scope raises the elevated-access warning. */
export const CreateDialogWriteWarning: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('pat-create-open'));
    await screen.findByTestId('pat-create-dialog');
    await userEvent.click(screen.getByTestId('pat-scope-goals:write'));
    await screen.findByTestId('pat-write-warning');
  },
};

/** The plaintext token is shown once after creation and never again. */
export const SecretIssued: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('pat-create-open'));
    await screen.findByTestId('pat-create-dialog');
    const nameInput = document.querySelector<HTMLInputElement>('#external-pat-name');
    if (!nameInput) throw new Error('PAT name input missing');
    await userEvent.type(nameInput, 'Demo CLI');
    await userEvent.click(screen.getByTestId('pat-create-submit'));
    await screen.findByTestId('pat-create-secret');
  },
};

/** Revoking a token asks for confirmation before the credential is removed. */
export const RevokeConfirmation: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('pat-revoke-open'));
    await screen.findByTestId('pat-revoke-dialog');
  },
};
