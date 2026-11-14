import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import { accountUiHost } from '../../account-ui-host';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import AccountProfileSection from './AccountProfileSection.vue';

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

function renderWithService(
  accountService: AccountClientPort,
  options: { cloud?: boolean } = {},
) {
  return {
    components: { AccountProfileSection },
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
      }
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, accountService as never);
      return {};
    },
    template:
      '<div style="max-width: 720px"><AccountProfileSection :show-profile="true" /></div>',
  };
}

const meta = {
  title: 'Business/Account/AccountProfileSection',
  component: AccountProfileSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { showProfile: true },
} satisfies Meta<typeof AccountProfileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalProfile: Story = {
  render: () => renderWithService(service()),
};

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

export const ProfileHidden: Story = {
  render: () => ({
    components: { AccountProfileSection },
    setup() {
      const authStore = useAuthenticationStore();
      authStore.reset();
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, service() as never);
      return {};
    },
    template:
      '<div style="max-width: 720px"><AccountProfileSection :show-profile="false" /></div>',
  }),
};

export const LoadError: Story = {
  render: () =>
    renderWithService(
      service({
        getMyProfile: async () =>
          fail({ code: 'NOT_FOUND', message: 'The profile could not be loaded.' }),
      }),
    ),
};

export const Loading: Story = {
  render: () =>
    renderWithService(
      service({
        getMyProfile: () => new Promise(() => undefined),
      }),
    ),
};
