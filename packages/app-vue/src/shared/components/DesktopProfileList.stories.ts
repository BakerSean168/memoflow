import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, ref, type Ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import { _resolveConfirm, useConfirm } from '@memoflow/ui-vue-shadcn';
import type { useDesktopProfiles } from '../composables/useDesktopProfiles';
import DesktopProfileList from './DesktopProfileList.vue';
import GlobalConfirmDialog from './GlobalConfirmDialog.vue';

const profileFixtures: ProfileSummary[] = [
  {
    profileId: 'profile-local-1',
    profileKind: 'local',
    displayName: 'Personal',
    avatarSeed: 'personal',
    avatarUrl: null,
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: 4,
    hasCredential: false,
    remembered: false,
  },
  {
    profileId: 'profile-local-2',
    profileKind: 'local',
    displayName: 'Design Lab',
    avatarSeed: 'design-lab',
    avatarUrl: null,
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: 3,
    hasCredential: true,
    remembered: false,
  },
  {
    profileId: 'profile-cloud-1',
    profileKind: 'registered',
    displayName: 'Work',
    avatarSeed: 'work',
    avatarUrl: null,
    identifierHint: 'alex@example.com',
    cloudAccountId: 'cloud-account-1',
    lastActiveAt: 2,
    hasCredential: false,
    remembered: false,
  },
  {
    profileId: 'profile-cloud-2',
    profileKind: 'registered',
    displayName: 'Studio',
    avatarSeed: 'studio',
    avatarUrl: null,
    identifierHint: 'studio@example.com',
    cloudAccountId: 'cloud-account-2',
    lastActiveAt: 1,
    hasCredential: true,
    remembered: false,
  },
];

interface PresenterOptions {
  profiles?: ProfileSummary[];
  activeProfileId?: string | null;
  selectedProfileId?: string | null;
  busyProfileId?: string | null;
  editingProfileId?: string | null;
  editName?: string;
  onRemove?: (profile: ProfileSummary) => void;
}

/**
 * Presenter double: mirrors the real `useDesktopProfiles` surface the list reads,
 * but every action only records intent. Removal runs the same `useConfirm`
 * confirmation the production presenter uses, so the dialog is real while no
 * Profile is ever touched.
 */
function createPresenter(options: PresenterOptions = {}) {
  const list = options.profiles ?? profileFixtures;
  const active = list.find((profile) => profile.profileId === options.activeProfileId) ?? null;
  return {
    profiles: computed(() => list),
    snapshot: ref(
      active
        ? {
            profile: active,
            unlockState: 'UNLOCKED' as const,
            cloudState: 'ONLINE' as const,
            capabilities: { local: true, sync: true, cloudAi: true, repositoryConnection: true },
          }
        : null,
    ),
    busyProfileId: ref<string | null>(options.busyProfileId ?? null),
    selectedProfileId: ref<string | null>(options.selectedProfileId ?? null),
    password: ref(''),
    newName: ref(''),
    newPassword: ref(''),
    editingProfileId: ref<string | null>(options.editingProfileId ?? null),
    editName: ref(options.editName ?? ''),
    accessView: ref('select'),
    refreshProfiles: async () => {},
    openProfile: async () => {},
    selectProfile: async () => {},
    switchProfile: async () => {},
    createLocalAccount: async () => {},
    renameProfile: async () => {},
    removeProfile: async (profile: ProfileSummary) => {
      const confirmed = await useConfirm({
        title: `Remove ${profile.displayName}?`,
        description: 'The double only records the intent; no Profile is deleted.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (confirmed) options.onRemove?.(profile);
    },
  };
}

function asPresenter(value: ReturnType<typeof createPresenter>) {
  return value as unknown as ReturnType<typeof useDesktopProfiles>;
}

interface FrameOptions {
  widthClass?: string;
  actionLog?: Ref<string>;
}

function renderList(
  args: Record<string, unknown>,
  presenter: ReturnType<typeof createPresenter>,
  options: FrameOptions = {},
) {
  return {
    components: { DesktopProfileList, GlobalConfirmDialog },
    setup() {
      // The confirm dialog state is a module singleton; a story that leaves the
      // dialog open must not leak it into the next visual review.
      _resolveConfirm(false);
      return {
        args,
        presenter: asPresenter(presenter),
        widthClass: options.widthClass ?? 'w-[40rem]',
        actionLog: options.actionLog,
      };
    },
    template: `
      <div class="rounded-xl border bg-background p-6" :class="widthClass">
        <DesktopProfileList v-bind="args" :presenter="presenter" />
        <p
          v-if="actionLog"
          class="mt-4 border-t pt-3 text-xs text-muted-foreground"
          data-testid="story-action-log"
        >
          {{ actionLog }}
        </p>
        <GlobalConfirmDialog />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/DesktopProfileList',
  component: DesktopProfileList,
  tags: ['autodocs'],
  args: { management: false },
  render: (args) => renderList(args, createPresenter({ activeProfileId: 'profile-local-1' })),
} satisfies Meta<typeof DesktopProfileList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Local and cloud tiles, locked and unlocked, with one active Profile. */
export const AccessTiles: Story = {};

/** The active Profile is a cloud account; the local tiles stay inactive. */
export const CloudProfileActive: Story = {
  render: (args) => renderList(args, createPresenter({ activeProfileId: 'profile-cloud-1' })),
};

/**
 * Stable open state: keyboard focus reveals the tile card and nothing dismisses
 * it, so reviewers see the expanded visual (hover uses the same reveal).
 */
export const TileCardOpen: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tile = page.getByTestId('desktop-profile-open-profile-local-2');
    tile.focus();
    await page.findByTestId('desktop-profile-menu-profile-local-2');
    await expect(page.getByTestId('desktop-profile-menu-open-profile-local-2')).toBeVisible();
    await expect(document.activeElement).toBe(tile);
  },
};

/** Hover reveals the same card after the dwell delay and keeps it while hovered. */
export const TileCardHover: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tile = page.getByTestId('desktop-profile-open-profile-local-2');
    await userEvent.hover(tile);
    await waitFor(() =>
      expect(page.queryByTestId('desktop-profile-menu-profile-local-2')).toBeInTheDocument(),
    );
  },
};

/**
 * Deletion intent is its own scene: choosing Delete closes the tile card and
 * raises the confirmation without removing anything yet.
 */
export const DeleteIntentConfirm: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    page.getByTestId('desktop-profile-open-profile-local-2').focus();
    await page.findByTestId('desktop-profile-menu-profile-local-2');
    await userEvent.click(page.getByTestId('desktop-profile-remove-profile-local-2'));
    await page.findByTestId('global-confirm-dialog');
    await expect(page.getByTestId('desktop-profile-menu-profile-local-2')).not.toBeInTheDocument();
    await expect(page.getByTestId('desktop-profile-open-profile-local-2')).toBeInTheDocument();
  },
};

/** Confirming reaches only the presenter double; the tile itself is untouched. */
export const DeleteConfirmedStaysSimulated: Story = {
  render: (args) => {
    const actionLog = ref('No action yet');
    return renderList(
      args,
      createPresenter({
        activeProfileId: 'profile-local-1',
        onRemove: (profile) => {
          actionLog.value = `Remove requested for ${profile.profileId} (simulated)`;
        },
      }),
      { actionLog },
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    page.getByTestId('desktop-profile-open-profile-local-2').focus();
    await page.findByTestId('desktop-profile-menu-profile-local-2');
    await userEvent.click(page.getByTestId('desktop-profile-remove-profile-local-2'));
    await userEvent.click(await page.findByTestId('global-confirm-confirm'));
    await waitFor(() =>
      expect(page.getByTestId('story-action-log')).toHaveTextContent(
        'Remove requested for profile-local-2 (simulated)',
      ),
    );
    await expect(page.getByTestId('desktop-profile-open-profile-local-2')).toBeInTheDocument();
  },
};

/** A credential-bearing tile exposes the inline password prompt instead of entering. */
export const PasswordPrompt: Story = {
  render: (args) =>
    renderList(
      args,
      createPresenter({
        activeProfileId: 'profile-local-1',
        selectedProfileId: 'profile-local-2',
      }),
    ),
};

/** Busy state disables every tile action until the pending operation settles. */
export const BusyProfile: Story = {
  render: (args) =>
    renderList(
      args,
      createPresenter({ activeProfileId: 'profile-local-1', busyProfileId: 'profile-local-2' }),
    ),
};

/** Narrow viewport keeps the tiles wrapping without horizontal overflow. */
export const NarrowScreen: Story = {
  render: (args) =>
    renderList(args, createPresenter({ activeProfileId: 'profile-local-1' }), {
      widthClass: 'w-[20rem]',
    }),
};

/** Management mode lists the same accounts with rename/remove controls. */
export const Management: Story = {
  args: { management: true },
  render: (args) =>
    renderList(
      args,
      createPresenter({
        activeProfileId: 'profile-local-1',
        editingProfileId: 'profile-local-1',
        editName: 'Personal',
      }),
    ),
};

/** Creating a local account opens the credential form as a modal dialog. */
export const ManagementCreateDialog: Story = {
  args: { management: true },
  render: (args) => renderList(args, createPresenter({ activeProfileId: 'profile-local-1' })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('desktop-profile-create-open'));
    await page.findByTestId('desktop-profile-create-dialog');
    await expect(page.getByTestId('desktop-profile-create-name')).toBeInTheDocument();
  },
};
