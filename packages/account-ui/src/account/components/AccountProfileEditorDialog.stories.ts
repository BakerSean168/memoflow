import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import type { AccountClientDTO } from '@memoflow/account-contracts';
import { Toaster } from '@memoflow/ui-vue-shadcn';
import { useAccountStore } from '../../stores/account-store';
import { accountUiHost } from '../../account-ui-host';
import type { AccountAvatarStore } from '../avatar/account-avatar-store';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';

const now = Date.now();

function createAccount(profile: Partial<AccountClientDTO['profile']> = {}): AccountClientDTO {
  return {
    id: 'account-demo',
    status: 'Active',
    profile: {
      nickname: 'Demo Builder',
      realName: null,
      avatarUrl: null,
      bio: 'Building a calmer workspace.',
      gender: 'Unspecified',
      birthday: null,
      ...profile,
    },
    version: 1,
    createdAt: now - 86_400_000,
    updatedAt: now,
    closedAt: null,
  } as AccountClientDTO;
}

/**
 * The dialog writes through `updateMyProfile`, so the double answers with the
 * account it actually received: saving then updates the fields, the draft clears
 * and the footer disappears exactly like production.
 */
function createService(account: AccountClientDTO, overrides: Partial<AccountClientPort> = {}) {
  let current = account;
  return {
    getMyProfile: async () => ok({ account: current, cloudIdentity: null }),
    updateMyProfile: async (request: { nickname: string; bio: string | null }) => {
      current = {
        ...current,
        profile: { ...current.profile, nickname: request.nickname, bio: request.bio },
        updatedAt: Date.now(),
      };
      return ok({ account: current, cloudIdentity: null });
    },
    closeAccount: async () => ok({ account: current, cloudIdentity: null }),
    ...overrides,
  } as unknown as AccountClientPort;
}

/** No platform storage is touched: the double only hands back a renderable URL. */
function createAvatarStore(): AccountAvatarStore {
  let next: string | null = null;
  return {
    load: async () => next,
    save: async (_accountKey, image) => {
      next = URL.createObjectURL(image);
      return next;
    },
  };
}

interface EditorDoubleOptions {
  account?: AccountClientDTO;
  service?: Partial<AccountClientPort>;
  initialOpen?: boolean;
  /** Production mounts one Toaster in the shell; failure toasts need it to be visible. */
  toaster?: boolean;
}

function renderEditor(options: EditorDoubleOptions = {}) {
  const account = options.account ?? createAccount();
  return {
    components: { AccountProfileEditorDialog, Toaster },
    setup() {
      // The account store is a Pinia singleton; each story must load its own
      // fixture instead of inheriting the previous story's account.
      useAccountStore().reset();
      const open = ref(options.initialOpen ?? true);
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, createService(account, options.service));
      provide(accountUiHost.ACCOUNT_AVATAR_STORE_KEY as symbol, createAvatarStore());
      return { open, toaster: options.toaster ?? false };
    },
    template: `
      <div class="flex flex-col items-center gap-3">
        <button
          type="button"
          data-testid="reopen-editor"
          class="rounded-md border px-2 py-1 text-xs"
          @click="open = true"
        >
          Reopen editor
        </button>
        <AccountProfileEditorDialog v-model:open="open" />
        <Toaster v-if="toaster" position="bottom-center" />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/Account/AccountProfileEditorDialog',
  component: AccountProfileEditorDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { open: true },
  render: () => renderEditor(),
} satisfies Meta<typeof AccountProfileEditorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Filled profile: both fields show the persisted values and no footer is shown. */
export const Open: Story = {};

/** A brand-new account has no nickname or bio; the empty fields stay editable. */
export const EmptyProfile: Story = {
  render: () => renderEditor({ account: createAccount({ nickname: '', bio: null }) }),
};

/** Long content keeps the layout: 20-character nickname and a multi-line bio. */
export const LongNicknameAndBio: Story = {
  render: () =>
    renderEditor({
      account: createAccount({
        nickname: 'Alexandria Chen-Liu',
        bio:
          'Leading a small product studio that builds quiet, keyboard-first tools. ' +
          'Most of my day is spent pairing with designers, writing release notes, ' +
          'and keeping the roadmap honest about what actually shipped this quarter.',
      }),
    }),
};

/** Over-long nickname stays in the field, flags the hint and blocks saving. */
export const InvalidNickname: Story = {
  render: () =>
    renderEditor({
      account: createAccount({ nickname: 'A long nickname that exceeds twenty characters' }),
    }),
};

/** Short nickname is rejected by the same hint after the field is edited. */
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

/** The avatar preview comes from the account, not from a draft field. */
export const AvatarPreview: Story = {
  render: () =>
    renderEditor({
      account: createAccount({
        avatarUrl:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
              '<rect width="80" height="80" rx="40" fill="#4f46e5"/>' +
              '<text x="40" y="50" font-family="sans-serif" font-size="28" fill="white" ' +
              'text-anchor="middle">DB</text></svg>',
          ),
      }),
    }),
};

/** A corrupt image is rejected by the decoder and the avatar stays untouched. */
export const AvatarUploadFailure: Story = {
  render: () => renderEditor({ toaster: true }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('profile-editor-avatar-input')) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['not a real png'], 'broken.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(input.value).toBe(''));
    await page.findByText('Could not update avatar');
    await expect(page.getByTestId('profile-editor-avatar')).toBeEnabled();
  },
};

/** Dirty draft exposes Reset/Save; the footer is the only place that saves. */
export const DirtyDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.type(nickname, ' Updated');
    await waitFor(() => expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument());
    await expect(page.getByTestId('profile-editor-save')).toBeEnabled();
  },
};

/** Closing with unsaved edits shakes the bar instead of discarding the draft. */
export const CloseGuardKeepsDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Draft name');
    await userEvent.click(page.getByTestId('profile-editor-close'));
    const dialog = page.getByTestId('profile-editor-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('data-guard', 'alert'));
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Draft name');
    await expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument();
  },
};

/** Reset returns both fields to the persisted values and hides the footer. */
export const ResetDiscardsDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Draft name');
    await userEvent.click(page.getByTestId('profile-editor-reset'));
    await waitFor(() =>
      expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument(),
    );
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Demo Builder');
  },
};

/** Reopening starts from the saved account, never from the abandoned draft. */
export const ReopenStartsFromPersistedProfile: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Draft name');
    await userEvent.click(page.getByTestId('profile-editor-reset'));
    await userEvent.click(page.getByTestId('profile-editor-close'));
    await waitFor(() =>
      expect(page.queryByTestId('profile-editor-dialog')).not.toBeInTheDocument(),
    );
    await userEvent.click(page.getByTestId('reopen-editor'));
    await waitFor(() =>
      expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Demo Builder'),
    );
  },
};

/** Saving disables both fields and the footer until the write settles. */
export const SaveBusy: Story = {
  render: () =>
    renderEditor({
      service: {
        updateMyProfile: () => new Promise(() => undefined),
      },
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Draft name');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() => expect(page.getByTestId('profile-editor-save')).toBeDisabled());
    await expect(page.getByTestId('profile-editor-save')).toHaveTextContent('Saving');
    await expect(page.getByTestId('profile-editor-nickname')).toBeDisabled();
    await expect(page.getByTestId('profile-editor-bio')).toBeDisabled();
  },
};

/** A refused write keeps the draft and the footer so the user can retry. */
export const SaveError: Story = {
  render: () =>
    renderEditor({
      toaster: true,
      service: {
        updateMyProfile: async () =>
          fail({ code: 'CONFLICT', message: 'The profile could not be updated.' }),
      },
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Draft name');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() => expect(page.getByTestId('profile-editor-save')).toBeEnabled());
    await expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Draft name');
  },
};

/** A successful write adopts the response: the footer clears without closing. */
export const SaveSuccess: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Updated Builder');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() =>
      expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument(),
    );
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Updated Builder');
    await expect(page.getByTestId('profile-editor-dialog')).toBeInTheDocument();
  },
};
