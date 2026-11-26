import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Toaster } from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';
import { useAccountStore } from '../stores/account-store';
import type { AccountAvatarStore } from '../avatar/account-avatar-store';
import AccountAvatarUploader from './AccountAvatarUploader.vue';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const EXISTING_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      '<rect width="80" height="80" rx="40" fill="#0f766e"/>' +
      '<text x="40" y="50" font-family="sans-serif" font-size="28" fill="white" ' +
      'text-anchor="middle">AB</text></svg>',
  );

function pngFile(name = 'avatar.png'): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

/** Mirrors the platform port: store the normalized PNG, return a renderable URL. */
function createAvatarStore(
  save: AccountAvatarStore['save'] = async (_accountKey, image) => URL.createObjectURL(image),
): AccountAvatarStore {
  let current: string | null = null;
  return {
    load: async () => current,
    save: async (accountKey, image) => {
      const url = await save(accountKey, image);
      current = url;
      return url;
    },
  };
}

interface UploaderDoubleOptions {
  avatarUrl?: string | null;
  disabled?: boolean;
  compact?: boolean;
  save?: AccountAvatarStore['save'];
}

function renderUploader(options: UploaderDoubleOptions = {}) {
  return {
    components: { AccountAvatarUploader, Toaster },
    setup() {
      useAccountStore().reset();
      const avatarUrl = ref<string | null>(options.avatarUrl ?? null);
      provide(accountUiHost.ACCOUNT_AVATAR_STORE_KEY as symbol, createAvatarStore(options.save));
      const onUpdated = (url: string) => {
        avatarUrl.value = url;
      };
      return {
        avatarUrl,
        onUpdated,
        disabled: options.disabled ?? false,
        compact: options.compact ?? false,
      };
    },
    template: `
      <div class="p-6">
        <AccountAvatarUploader
          :avatar-url="avatarUrl"
          initials="AB"
          :compact="compact"
          :disabled="disabled"
          @updated="onUpdated"
        />
        <Toaster position="bottom-center" />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/Account/AccountAvatarUploader',
  component: AccountAvatarUploader,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { initials: 'AB' },
  render: () => renderUploader(),
} satisfies Meta<typeof AccountAvatarUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No stored avatar: the initials fallback is the click target. */
export const EmptyAvatar: Story = {};

/** A stored avatar replaces the initials; hover/focus reveals the camera affordance. */
export const ExistingAvatar: Story = {
  render: () => renderUploader({ avatarUrl: EXISTING_AVATAR }),
};

/** Picking a file normalizes it, saves it and swaps the preview in place. */
export const SelectedPreview: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('account-avatar-uploader-input')) as HTMLInputElement;
    await userEvent.upload(input, pngFile());
    await waitFor(() => expect(canvasElement.querySelector('img')).not.toBeNull());
    await expect(page.getByTestId('account-avatar-uploader')).toBeEnabled();
    await expect(page.getByTestId('account-avatar-uploader-helper')).toHaveAttribute(
      'data-state',
      'idle',
    );
    await page.findByText('Avatar updated');
  },
};

/** A corrupt image adds a danger line under the avatar and leaves the image untouched. */
export const UploadError: Story = {
  render: () => renderUploader({ avatarUrl: EXISTING_AVATAR }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('account-avatar-uploader-input')) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['not a real png'], 'broken.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(input.value).toBe(''));
    const helper = await page.findByTestId('account-avatar-uploader-helper');
    await waitFor(() => expect(helper).toHaveAttribute('data-state', 'error'));
    await expect(helper).toHaveTextContent('Could not update avatar');
    await expect(helper).toHaveClass('text-destructive');
    await expect(canvasElement.querySelector('img')).not.toBeNull();
    await expect(page.getByTestId('account-avatar-uploader')).toBeEnabled();
  },
};

/** Read-only surfaces disable the picker without hiding the avatar. */
export const ReadOnly: Story = {
  render: () => renderUploader({ avatarUrl: EXISTING_AVATAR, disabled: true }),
};

/** While the platform port is still writing, a spinner replaces the camera and picks are blocked. */
export const Uploading: Story = {
  render: () =>
    renderUploader({
      save: () => new Promise(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('account-avatar-uploader-input')) as HTMLInputElement;
    await userEvent.upload(input, pngFile());
    const helper = await page.findByTestId('account-avatar-uploader-helper');
    await waitFor(() => expect(page.getByText('Processing avatar...')).toBeInTheDocument());
    await expect(helper).toHaveAttribute('data-state', 'uploading');
    await expect(page.getByTestId('account-avatar-uploader')).toBeDisabled();
    await expect(page.getByTestId('account-avatar-uploader')).toHaveAttribute('aria-busy', 'true');
    await expect(canvasElement.querySelector('.animate-spin')).not.toBeNull();
  },
};

/** Editor affordance: persistent camera badge, no recommendation in the resting state. */
export const ProfileCardAvatar: Story = {
  render: () => renderUploader({ compact: true, avatarUrl: EXISTING_AVATAR }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByTestId('account-avatar-uploader-helper')).not.toBeInTheDocument();
    await expect(page.getByTestId('account-avatar-uploader')).toHaveAccessibleName('Change Avatar');
  },
};

export const ProfileCardUploading: Story = {
  ...Uploading,
  render: () => renderUploader({ compact: true, save: () => new Promise(() => undefined) }),
};

export const ProfileCardUploadError: Story = {
  ...UploadError,
  render: () => renderUploader({ compact: true, avatarUrl: EXISTING_AVATAR }),
};
