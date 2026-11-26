import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import { accountUiHost, CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import AccountSettingsComposition from './AccountSettingsComposition.vue';

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

const cloudIdentity = {
  id: 'identity-demo',
  email: 'demo@example.com',
  name: 'Demo Builder',
  emailVerified: true,
};

function service(overrides: Partial<AccountClientPort> = {}): AccountClientPort {
  return {
    getMyProfile: async () => ok({ account, cloudIdentity: null }),
    updateMyProfile: async () => ok({ account, cloudIdentity: null }),
    closeAccount: async () => ok({ account, cloudIdentity: null }),
    ...overrides,
  } as unknown as AccountClientPort;
}

const securityService = {
  requestAccountVerification: async () =>
    ok({ challengeId: 'challenge-demo', retryAfterSeconds: 0, expiresInSeconds: 600 }),
  verifyAccountVerification: async () => ok({ verificationToken: 'v'.repeat(43) }),
  verifyAccountPassword: async () => ok(undefined),
  requestEmailChange: async () => ok(undefined),
  listAccountSessions: async () =>
    ok([
      {
        id: 'current',
        current: true,
        userAgent: 'MemoFlow Desktop/0.23 (Linux)',
        createdAt: '2026-11-20T09:00:00.000Z',
      },
      {
        id: 'browser',
        current: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
        createdAt: '2026-11-19T09:00:00.000Z',
      },
    ]),
  revokeAccountSession: async () => ok(undefined),
  deleteAccountPermanently: async () => ok(undefined),
};

function renderWithService(
  accountService: AccountClientPort,
  options: { cloud?: boolean; local?: boolean } = {},
) {
  return {
    components: { AccountSettingsComposition },
    setup() {
      const authStore = useAuthenticationStore();
      authStore.reset();
      if (options.cloud) {
        authStore.hydrateCloudSession({
          account: {
            id: 'cloud-account-demo',
            email: 'demo@example.com',
            name: 'Demo Builder',
            emailVerified: true,
          },
          session: { id: 'session-demo', expiresAt: '2030-01-01T00:00:00.000Z' },
        });
        provide(CLOUD_ACCOUNT_SECURITY_KEY, securityService as never);
      }
      if (options.local) {
        provide(
          accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY as symbol,
          ref({
            profile: {
              profileId: 'local-demo',
              profileKind: 'local',
              displayName: 'Demo Builder',
            },
          }) as never,
        );
        provide(
          accountUiHost.DESKTOP_BRIDGE_KEY as symbol,
          {
            invoke: async () =>
              ok({
                profileId: 'local-demo',
                suppressed: false,
                candidates: [
                  { profileId: 'local-demo', profileKind: 'local', displayName: 'Demo Builder' },
                ],
              }),
          } as never,
        );
      }
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, accountService as never);
      return {};
    },
    template: '<div style="max-width: 720px"><AccountSettingsComposition /></div>',
  };
}

const meta = {
  title: 'Business/Account/AccountSettingsComposition',
  component: AccountSettingsComposition,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccountSettingsComposition>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cloud account: profile summary row opens the editor; security and sign-out stay here. */
export const CloudAccount: Story = {
  render: () =>
    renderWithService(
      service({
        getMyProfile: async () => ok({ account, cloudIdentity }),
        updateMyProfile: async () => ok({ account, cloudIdentity }),
      }),
      { cloud: true },
    ),
};

/** Desktop local account: local password and launch-time auto enter are available. */
export const LocalAccount: Story = {
  render: () => renderWithService(service(), { local: true }),
};

/** A failed profile load keeps the summary row usable and offers a retry. */
export const LoadError: Story = {
  render: () =>
    renderWithService(
      service({
        getMyProfile: async () =>
          fail({ code: 'NOT_FOUND', message: 'The profile could not be loaded.' }),
      }),
      { cloud: true },
    ),
};

/** The summary row reports the pending profile load instead of blank fields. */
export const Loading: Story = {
  render: () =>
    renderWithService(
      service({
        getMyProfile: () => new Promise(() => undefined),
      }),
      { cloud: true },
    ),
};
