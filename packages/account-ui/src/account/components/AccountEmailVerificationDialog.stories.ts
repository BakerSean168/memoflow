import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { screen, userEvent, waitFor } from 'storybook/test';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import AccountEmailVerificationDialog from './AccountEmailVerificationDialog.vue';

type Options = {
  retryAfterSeconds?: number;
  expiresInSeconds?: number;
  verify?: 'ok' | 'invalid';
};

function service(options: Options = {}) {
  return {
    requestAccountVerification: async () =>
      ok({
        challengeId: '00000000-0000-4000-8000-000000000000',
        retryAfterSeconds: options.retryAfterSeconds ?? 60,
        expiresInSeconds: options.expiresInSeconds ?? 600,
      }),
    verifyAccountVerification: async () =>
      options.verify === 'invalid'
        ? fail({ code: 'ACCOUNT_VERIFICATION_INVALID', message: '验证码错误或已失效，请重试或重新发送' })
        : ok({ verificationToken: 'v'.repeat(43) }),
  };
}

function renderDialog(options: Options = {}) {
  return {
    components: { AccountEmailVerificationDialog },
    setup() {
      provide(CLOUD_ACCOUNT_SECURITY_KEY as symbol, service(options) as never);
      return { open: ref(true) };
    },
    template:
      '<AccountEmailVerificationDialog v-model:open="open" purpose="change-password" email="demo@example.com" />',
  };
}

const meta = {
  title: 'Business/Account/AccountEmailVerificationDialog',
  component: AccountEmailVerificationDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AccountEmailVerificationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step one: explain why the current mailbox must be verified. */
export const Initial: Story = {
  render: () => renderDialog(),
};

/** Step two: six-digit input with the resend cooldown. */
export const CodeInput: Story = {
  render: () => renderDialog({ retryAfterSeconds: 60 }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-verification-send'));
    await userEvent.type(await screen.findByTestId('account-verification-code'), '123456');
  },
};

/** The challenge elapsed before submission; only a new code can continue. */
export const Expired: Story = {
  render: () => renderDialog({ expiresInSeconds: 1 }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-verification-send'));
    await waitFor(
      () => {
        if (!screen.queryByTestId('account-verification-expired')) {
          throw new Error('expired state not shown');
        }
      },
      { timeout: 4000 },
    );
  },
};

/** A rejected code keeps the input step and shows the server message. */
export const InvalidCode: Story = {
  render: () => renderDialog({ verify: 'invalid' }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('account-verification-send'));
    await userEvent.type(await screen.findByTestId('account-verification-code'), '123456');
    await userEvent.click(await screen.findByTestId('account-verification-verify'));
    await screen.findByTestId('account-verification-error');
  },
};
