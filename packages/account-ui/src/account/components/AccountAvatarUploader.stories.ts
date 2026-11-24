import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Toaster } from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';
import { useAccountStore } from '../../stores/account-store';
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
      return { avatarUrl, onUpdated, disabled: options.disabled ?? false };
    },
    template: `
      <div class="p-6">
        <AccountAvatarUploader
          :avatar-url="avatarUrl"
          initials="AB"
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
  },
};

/** A corrupt image surfaces the failure toast and leaves the previous state untouched. */
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
    await page.findByText('Could not update avatar');
    await expect(canvasElement.querySelector('img')).not.toBeNull();
    await expect(page.getByTestId('account-avatar-uploader')).toBeEnabled();
  },
};

/** Read-only surfaces disable the picker without hiding the avatar. */
export const ReadOnly: Story = {
  render: () => renderUploader({ avatarUrl: EXISTING_AVATAR, disabled: true }),
};

/** While the platform port is still writing, the label reports progress and blocks picks. */
export const Uploading: Story = {
  render: () =>
    renderUploader({
      save: () => new Promise(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = (await page.findByTestId('account-avatar-uploader-input')) as HTMLInputElement;
    await userEvent.upload(input, pngFile());
    await waitFor(() => expect(page.getByText('Processing avatar...')).toBeInTheDocument());
    await expect(page.getByTestId('account-avatar-uploader')).toBeDisabled();
  },
};
