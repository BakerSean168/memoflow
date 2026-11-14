import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import { accountUiHost } from '../../account-ui-host';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';

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

function service(): AccountClientPort {
  return {
    getMyProfile: async () => ok({ account, cloudIdentity: null }),
    updateMyProfile: async () => ok({ account, cloudIdentity: null }),
    closeAccount: async () => ok({ account, cloudIdentity: null }),
  } as unknown as AccountClientPort;
}

const meta = {
  title: 'Business/Account/AccountProfileEditorDialog',
  component: AccountProfileEditorDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { open: true },
  render: (args) => ({
    components: { AccountProfileEditorDialog },
    setup() {
      const open = ref(args.open);
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, service() as never);
      return { open };
    },
    template: '<AccountProfileEditorDialog v-model:open="open" />',
  }),
} satisfies Meta<typeof AccountProfileEditorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const DirtyDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.type(nickname, ' Updated');
    await waitFor(() => expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument());
    await expect(page.getByTestId('profile-editor-save')).toBeEnabled();
  },
};

export const NicknameTooShort: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'A');
    await expect(page.getByTestId('profile-editor-nickname-hint')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-save')).toBeDisabled();
  },
};
