import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { ok } from '@memoflow/transport-contracts/result';
import { accountUiHost } from '@memoflow/account-ui/host';
import { useAuthenticationStore } from '@memoflow/account-ui';
import { settingUiHost } from '@memoflow/setting-ui/host';
import { AccountSettingsSection } from '@memoflow/setting-ui';

const now = Date.now();

const account = {
  id: 'account-demo',
  status: 'Active',
  profile: {
    nickname: 'Demo Builder',
    realName: null,
    avatarUrl: null,
    bio: 'Building a calmer workspace.',
    gender: 'Unspecified',
    birthday: null,
  },
  version: 1,
  createdAt: now - 86_400_000,
  updatedAt: now,
  closedAt: null,
};

const identity = {
  id: 'identity-demo',
  email: 'demo@example.com',
  name: 'Demo Builder',
  emailVerified: true,
};

const pat = {
  id: 'pat-demo',
  name: 'Daily notes agent',
  prefix: 'mfp_Demo123',
  audience: 'https://api.example.invalid/mcp',
  scopes: ['goals:read', 'tasks:read'],
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
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

const authService = {
  changePassword: async () => ok(undefined),
  forgotPassword: async () => ok(undefined),
  resetPassword: async () => ok(undefined),
};

const accountService = {
  getMyProfile: async () => ok({ account, cloudIdentity: identity }),
  updateMyProfile: async () => ok({ account, cloudIdentity: identity }),
  closeAccount: async () => ok({ account, cloudIdentity: identity }),
};

function externalAgents(options: { oauth?: boolean; pats?: unknown[]; connections?: unknown[] } = {}) {
  return {
    capabilities: async () => ok({ oauth: options.oauth ?? false }),
    listPats: async () => ok(options.pats ?? [pat]),
    listConnections: async () => ok(options.connections ?? []),
    createPat: async () => ok({ ...pat, secret: 'mfp_demo_not_a_real_secret' }),
    revokePat: async () => ok(undefined),
    revokeConnection: async () => ok(undefined),
    consentRequest: async () => ok(undefined),
    decideConsent: async () => ok(undefined),
  };
}

type Options = {
  auth?: boolean;
  external?: ReturnType<typeof externalAgents> | false;
};

function renderSection(options: Options = {}) {
  return {
    components: { AccountSettingsSection },
    setup() {
      const authStore = useAuthenticationStore();
      authStore.reset();
      authStore.hydrateCloudSession({
        account: identity,
        session: { id: 'session-demo', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, accountService as never);
      if (options.auth !== false) {
        provide(accountUiHost.AUTH_SERVICE_KEY as symbol, authService as never);
        provide(settingUiHost.AUTH_SERVICE_KEY as symbol, authService as never);
      }
      if (options.external !== false) {
        const service = options.external ?? externalAgents();
        provide(accountUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol, service as never);
        provide(settingUiHost.EXTERNAL_AGENT_SERVICE_KEY as symbol, service as never);
      }
      return {};
    },
    template: '<div style="max-width: 820px"><AccountSettingsSection /></div>',
  };
}

const meta = {
  title: 'Business/Setting/AccountSettingsSection',
  component: AccountSettingsSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
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
