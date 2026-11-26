import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { screen, userEvent, waitFor } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import { accountUiHost } from '../../account-ui-host';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import CloudPasswordSection from './CloudPasswordSection.vue';

const identity = {
  id: 'identity-demo',
  email: 'demo@example.com',
  name: 'Demo Builder',
  emailVerified: true,
};

function authService(overrides: Partial<CloudAuthClientPort> = {}): CloudAuthClientPort {
  return {
    changePassword: async () => ok(undefined),
    forgotPassword: async () => ok(undefined),
    resetPassword: async () => ok(undefined),
    ...overrides,
  } as unknown as CloudAuthClientPort;
}

type Options = {
  service?: CloudAuthClientPort;
  receipt?: {
    code: string;
    message: string;
    requestId: string | null;
    retryable: boolean;
  } | null;
};

function renderSection(options: Options = {}) {
  return {
    components: { CloudPasswordSection },
    setup() {
      const store = useAuthenticationStore();
      store.reset();
      store.hydrateCloudSession({
        account: identity,
        session: { id: 'session-demo', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      if (options.receipt) {
        store.setPasswordMutationError({
          ...options.receipt,
          operation: 'change-password',
          failedAt: Date.UTC(2026, 10, 24, 9, 0),
        });
      }
      provide(
        accountUiHost.AUTH_SERVICE_KEY as symbol,
        (options.service ?? authService()) as never,
      );
      return {};
    },
    template: '<div style="max-width: 720px"><CloudPasswordSection /></div>',
  };
}

const meta = {
  title: 'Business/Account/CloudPasswordSection',
  component: CloudPasswordSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CloudPasswordSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Signed-in cloud account: password action and masked reset recipient. */
export const Default: Story = {
  render: () => renderSection(),
};

/** A recoverable failure keeps the message, request id and retry action after reload. */
export const FailedChangeReceipt: Story = {
  render: () =>
    renderSection({
      receipt: {
        code: 'AUTH_PASSWORD_INCORRECT',
        message: 'The current password is incorrect. Please try again.',
        requestId: 'req_demo_1234',
        retryable: true,
      },
    }),
};

/** Confirmation mismatch is caught inline before the request leaves the page. */
export const PasswordMismatch: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('cloud-password-open'));
    await userEvent.type(await screen.findByTestId('cloud-password-current'), 'current-pass');
    await userEvent.type(screen.getByTestId('cloud-password-new'), 'new-pass');
    await userEvent.type(screen.getByTestId('cloud-password-confirm'), 'different-pass');
    await waitFor(() => {
      if (!screen.queryByTestId('cloud-password-mismatch')) throw new Error('mismatch not shown');
    });
  },
};

/** A non-retryable failure offers dismissal only; no request id section is fabricated. */
export const NonRetryableFailure: Story = {
  render: () =>
    renderSection({
      receipt: {
        code: 'AUTH_PASSWORD_POLICY',
        message: 'The new password does not meet the security policy.',
        requestId: null,
        retryable: false,
      },
    }),
};

export const ChangePasswordDialog: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('cloud-password-open'));
    await screen.findByTestId('cloud-password-dialog');
  },
};
