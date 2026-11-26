import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import type { AccountClientDTO } from '@memoflow/account-contracts';
import { Button, Toaster } from '@memoflow/ui-vue-shadcn';
import { useAccountStore } from '../stores/account-store';
import { accountUiHost } from '../../account-ui-host';
import type { AccountAvatarStore } from '../avatar/account-avatar-store';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';

const now = Date.UTC(2024, 0, 30, 12);

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pngFile(name = 'avatar.png'): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

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
function createAvatarStore(
  save: AccountAvatarStore['save'] = async (_accountKey, image) => URL.createObjectURL(image),
): AccountAvatarStore {
  let next: string | null = null;
  return {
    load: async () => next,
    save: async (accountKey, image) => {
      const url = await save(accountKey, image);
      next = url;
      return url;
    },
  };
}

interface EditorDoubleOptions {
  account?: AccountClientDTO;
  service?: Partial<AccountClientPort>;
  initialOpen?: boolean;
  /** Production mounts one Toaster in the shell; failure toasts need it to be visible. */
  toaster?: boolean;
  avatarSave?: AccountAvatarStore['save'];
  /**
   * Narrow review: Storybook ships without a viewport addon, so the story pins
   * the portalled dialog to 320px instead of resizing the canvas. The responsive
   * layout only depends on available width, so this shows the real narrow
   * composition: 16px gutters, single column, no squeezed controls.
   */
  narrow?: boolean;
}

const NARROW_DIALOG_STYLE =
  'div[role="dialog"]:has([data-testid="profile-editor-dialog"])' +
  '{width:320px!important;max-width:320px!important;}';

function renderEditor(options: EditorDoubleOptions = {}) {
  const account = options.account ?? createAccount();
  return {
    components: { AccountProfileEditorDialog, Toaster, Button },
    setup() {
      // The account store is a Pinia singleton; each story must load its own
      // fixture instead of inheriting the previous story's account.
      useAccountStore().reset();
      const open = ref(options.initialOpen ?? true);
      provide(accountUiHost.ACCOUNT_SERVICE_KEY as symbol, createService(account, options.service));
      provide(
        accountUiHost.ACCOUNT_AVATAR_STORE_KEY as symbol,
        createAvatarStore(options.avatarSave),
      );
      if (options.narrow) {
        let styleElement: HTMLStyleElement | null = null;
        onMounted(() => {
          styleElement = document.createElement('style');
          styleElement.dataset.story = 'profile-editor-narrow';
          styleElement.textContent = NARROW_DIALOG_STYLE;
          document.head.appendChild(styleElement);
        });
        onBeforeUnmount(() => styleElement?.remove());
      }
      return { open, toaster: options.toaster ?? false };
    },
    template: `
      <div class="flex flex-col items-center gap-3">
        <Button
          type="button"
          data-testid="reopen-editor"
          class="rounded-md border px-2 py-1 text-xs"
          @click="open = true"
        >
          Reopen editor
        </Button>
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

/** Default open: filled profile, flat field groups, no footer until an edit. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument();
    await expect(page.queryByTestId('profile-editor-nickname-count')).not.toBeInTheDocument();
    await expect(page.queryByTestId('profile-editor-bio-count')).not.toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-member-since')).toHaveTextContent(
      'Member since Jan 29, 2024',
    );
  },
};

/** A brand-new account has no nickname or bio; the empty fields stay editable. */
export const EmptyProfile: Story = {
  render: () => renderEditor({ account: createAccount({ nickname: '', bio: null }) }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('profile-editor-nickname-hint')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname-count')).toHaveTextContent('0/20');
    await expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument();
  },
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

/** Over-long nickname stays in the field, flags the inline error and counter. */
export const InvalidNickname: Story = {
  render: () =>
    renderEditor({
      account: createAccount({ nickname: 'A long nickname that exceeds twenty characters' }),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('profile-editor-nickname-hint')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname-count')).toHaveTextContent('46/20');
    await expect(page.queryByTestId('profile-editor-save')).not.toBeInTheDocument();
  },
};

/** Short nickname is rejected by the same inline error and blocks saving. */
export const NicknameTooShort: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'A');
    await userEvent.keyboard('{Enter}');
    await expect(page.getByTestId('profile-editor-nickname-hint')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname-count')).toHaveTextContent('1/20');
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
              '<rect width="80" height="80" rx="40" fill="#0f766e"/>' +
              '<text x="40" y="50" font-family="sans-serif" font-size="28" fill="white" ' +
              'text-anchor="middle">DB</text></svg>',
          ),
      }),
    }),
};

/** While the avatar port is writing, the circle shows a spinner and blocks picks. */
export const AvatarUploading: Story = {
  render: () =>
    renderEditor({
      avatarSave: () => new Promise(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('profile-editor-avatar-input')) as HTMLInputElement;
    await userEvent.upload(input, pngFile());
    await waitFor(() =>
      expect(page.getByTestId('profile-editor-avatar')).toHaveAttribute('aria-busy', 'false'),
    );
    await userEvent.click(page.getByTestId('profile-editor-nickname'));
    await userEvent.keyboard('{Enter}');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    const helper = await page.findByTestId('profile-editor-avatar-helper');
    await waitFor(() => expect(helper).toHaveTextContent('Processing avatar...'));
    await expect(helper).toHaveAttribute('data-state', 'uploading');
    await expect(page.getByTestId('profile-editor-avatar')).toBeDisabled();
  },
};

/** A corrupt image is rejected by the decoder and reported inline under the avatar. */
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
    const helper = await page.findByTestId('profile-editor-avatar-helper');
    await waitFor(() => expect(helper).toHaveAttribute('data-state', 'error'));
    await expect(helper).toHaveTextContent('Could not update avatar');
    await expect(helper).toHaveClass('text-destructive');
    await expect(page.getByTestId('profile-editor-avatar')).toBeEnabled();
  },
};

/** Dirty draft exposes Reset/Save plus the muted unsaved line in the footer. */
export const DirtyDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.type(nickname, ' Updated');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument());
    await expect(page.getByTestId('profile-editor-prompt')).toBeInTheDocument();
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
    await userEvent.keyboard('{Enter}');
    await userEvent.click(page.getByTestId('profile-editor-close'));
    const dialog = page.getByTestId('profile-editor-dialog');
    await waitFor(() => expect(dialog).toHaveAttribute('data-guard', 'alert'));
    await expect(page.getByTestId('profile-editor-prompt')).toHaveClass('text-destructive');
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
    await userEvent.keyboard('{Enter}');
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
    await userEvent.keyboard('{Enter}');
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

/** Saving shows the muted progress row and disables fields plus both actions. */
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
    await userEvent.keyboard('{Enter}');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() => expect(page.getByTestId('profile-editor-save')).toBeDisabled());
    await expect(page.getByTestId('profile-editor-status')).toHaveAttribute('data-phase', 'saving');
    await expect(page.getByTestId('profile-editor-status')).toHaveTextContent('Saving');
    await expect(page.getByTestId('profile-editor-save')).toHaveTextContent('Saving');
    await expect(page.getByTestId('profile-editor-nickname')).toBeDisabled();
    await expect(page.getByTestId('profile-editor-bio')).toBeDisabled();
    await expect(page.getByTestId('profile-editor-reset')).toBeDisabled();
  },
};

/** A refused write keeps the draft and adds a danger feedback row above the actions. */
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
    await userEvent.keyboard('{Enter}');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() =>
      expect(page.getByTestId('profile-editor-status')).toHaveAttribute('data-phase', 'error'),
    );
    await expect(page.getByTestId('profile-editor-status')).toHaveTextContent(
      'Failed to update profile',
    );
    await expect(page.getByTestId('profile-editor-status')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('profile-editor-save')).toBeEnabled();
    await expect(page.getByTestId('profile-editor-footer')).toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Draft name');
  },
};

/** A successful write adopts the response and confirms in the feedback row. */
export const SaveSuccess: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const nickname = await page.findByTestId('profile-editor-nickname');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Updated Builder');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(page.getByTestId('profile-editor-save'));
    await waitFor(() =>
      expect(page.getByTestId('profile-editor-status')).toHaveAttribute('data-phase', 'success'),
    );
    await expect(page.getByTestId('profile-editor-status')).toHaveTextContent('Profile updated');
    await expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument();
    await expect(page.getByTestId('profile-editor-nickname')).toHaveValue('Updated Builder');
    await expect(page.getByTestId('profile-editor-dialog')).toBeInTheDocument();
  },
};

/** Narrow review: dialog near full width with single-column fields and 16px gutters. */
export const NarrowDialog: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => renderEditor({ narrow: true }),
};

/** A picked image is only a preview until Enter and Save; Reset restores it. */
export const AvatarDraft: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.upload(await page.findByTestId('profile-editor-avatar-input'), pngFile());
    await waitFor(() =>
      expect(page.getByTestId('profile-editor-avatar')).toHaveAttribute('aria-busy', 'false'),
    );
    await expect(page.queryByTestId('profile-editor-footer')).not.toBeInTheDocument();
    await userEvent.click(page.getByTestId('profile-editor-nickname'));
    await userEvent.keyboard('{Enter}');
    await expect(page.getByTestId('profile-editor-save')).toBeEnabled();
  },
};

export const NarrowDirtyDialog: Story = {
  ...DirtyDraft,
  parameters: { layout: 'fullscreen' },
  render: () => renderEditor({ narrow: true }),
};
