import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import DesktopProfileAccessView from './DesktopProfileAccessView.vue';

const now = 1_763_000_000_000;

function profile(overrides: Partial<ProfileSummary> & Pick<ProfileSummary, 'profileId'>) {
  return {
    profileKind: 'local',
    displayName: 'Profile',
    avatarSeed: overrides.profileId,
    avatarUrl: null,
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: now,
    hasCredential: false,
    remembered: false,
    ...overrides,
  } satisfies ProfileSummary;
}

const localPersonal = profile({
  profileId: 'profile-local-1',
  displayName: 'Personal',
  lastActiveAt: now - 1_000,
});

const localLocked = profile({
  profileId: 'profile-local-2',
  displayName: 'Design Lab',
  lastActiveAt: now - 2_000,
  hasCredential: true,
});

const cloudWork = profile({
  profileId: 'profile-cloud-1',
  profileKind: 'registered',
  displayName: 'Work',
  identifierHint: 'alex@example.com',
  cloudAccountId: 'cloud-account-1',
  lastActiveAt: now - 3_000,
});

const cloudStudio = profile({
  profileId: 'profile-cloud-2',
  profileKind: 'registered',
  displayName: 'Studio',
  identifierHint: 'studio@example.com',
  cloudAccountId: 'cloud-account-2',
  lastActiveAt: now - 4_000,
  hasCredential: true,
});

const allProfiles = [localPersonal, localLocked, cloudWork, cloudStudio];

/**
 * Bridge double: answers only the Profile-access channels the view reads on
 * mount. No IPC, database, cloud session or real Profile is involved.
 */
function createBridge(profiles: ProfileSummary[], activeProfileId: string | null) {
  const active = profiles.find((item) => item.profileId === activeProfileId) ?? null;
  return {
    invoke: async (channel: string) => {
      switch (channel) {
        case ProfileAccessChannels.LIST:
          return { ok: true, data: profiles };
        case ProfileAccessChannels.GET_SNAPSHOT:
          return {
            ok: true,
            data: {
              profile: active,
              unlockState: 'UNLOCKED',
              cloudState: active ? 'ONLINE' : 'UNBOUND',
              capabilities: {
                local: true,
                sync: true,
                cloudAi: true,
                repositoryConnection: true,
              },
            },
          };
        case ProfileAccessChannels.AUTO_ENTER_GET:
          return {
            ok: true,
            data: { profileId: null, candidates: [], suppressed: false },
          };
        case ProfileAccessChannels.SELECT:
        case WindowChannels.TRANSITION_TO_MAIN:
        case WindowChannels.SET_PROFILE_ACCESS_HEIGHT:
          return { ok: true };
        default:
          return { ok: true };
      }
    },
  } as unknown as ElectronBridge;
}

interface AccessFrameOptions {
  profiles?: ProfileSummary[];
  activeProfileId?: string | null;
  widthClass?: string;
}

function renderAccess(options: AccessFrameOptions = {}) {
  const profiles = options.profiles ?? allProfiles;
  return {
    components: { DesktopProfileAccessView },
    setup() {
      provide(
        DESKTOP_BRIDGE_KEY,
        createBridge(profiles, options.activeProfileId ?? 'profile-local-1'),
      );
      return { widthClass: options.widthClass ?? 'w-[64rem]' };
    },
    template: `
      <div class="h-[40rem] bg-background p-6" :class="widthClass">
        <DesktopProfileAccessView />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/DesktopProfileAccessView',
  component: DesktopProfileAccessView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () => renderAccess(),
} satisfies Meta<typeof DesktopProfileAccessView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Complete entry layout: title, local/cloud tiles and the create-local entry. */
export const SelectProfiles: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('desktop-profile-open-profile-local-1');
    await expect(page.getByTestId('desktop-profile-create-local')).toBeInTheDocument();
    await expect(page.getByTestId('desktop-profile-open-profile-local-1')).toHaveAttribute(
      'aria-current',
      'true',
    );
  },
};

/** The active account is a cloud Profile; its tile carries the current marker. */
export const CloudProfileActive: Story = {
  render: () => renderAccess({ activeProfileId: 'profile-cloud-1' }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tile = await page.findByTestId('desktop-profile-open-profile-cloud-1');
    await expect(tile).toHaveAttribute('aria-current', 'true');
    await expect(tile).toHaveTextContent('Current Profile');
  },
};

/** The locked local tile is the unlock entry: choose it to reach the password state. */
export const LockedProfileUnlock: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tile = await page.findByTestId('desktop-profile-open-profile-local-2');
    await expect(tile).toHaveTextContent('Unlock');
    await userEvent.click(tile);
    await waitFor(() =>
      expect(page.queryByTestId('desktop-profile-password-state')).toBeInTheDocument(),
    );
    await expect(page.getByTestId('desktop-profile-password-profile-local-2')).toBeInTheDocument();
  },
};

/** No remembered accounts: only the create-local entry remains. */
export const EmptyList: Story = {
  render: () => renderAccess({ profiles: [], activeProfileId: null }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('desktop-profile-create-local');
    await expect(
      page.queryByTestId('desktop-profile-open-profile-local-1'),
    ).not.toBeInTheDocument();
  },
};

/** Narrow entry window: the tile row wraps and the title stays centered. */
export const NarrowScreen: Story = {
  render: () => renderAccess({ widthClass: 'w-[22rem]' }),
};
