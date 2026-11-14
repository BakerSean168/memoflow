import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, ref } from 'vue';
import { userEvent, within } from 'storybook/test';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import type { useDesktopProfiles } from '../composables/useDesktopProfiles';
import DesktopProfileList from './DesktopProfileList.vue';

const profiles: ProfileSummary[] = [
  {
    profileId: 'profile-local-1',
    profileKind: 'local',
    displayName: 'Personal',
    avatarSeed: 'personal',
    avatarUrl: null,
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: 3,
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
    lastActiveAt: 2,
    hasCredential: true,
    remembered: true,
  },
  {
    profileId: 'profile-cloud-1',
    profileKind: 'registered',
    displayName: 'Work',
    avatarSeed: 'work',
    avatarUrl: null,
    identifierHint: 'alex@example.com',
    cloudAccountId: 'cloud-account-1',
    lastActiveAt: 1,
    hasCredential: false,
    remembered: false,
  },
];

function createPresenter(activeProfileId: string | null = null) {
  const list = ref(profiles);
  const active = profiles.find((profile) => profile.profileId === activeProfileId) ?? null;
  return {
    profiles: computed(() => list.value),
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
    busyProfileId: ref<string | null>(null),
    selectedProfileId: ref<string | null>(null),
    password: ref(''),
    newName: ref(''),
    newPassword: ref(''),
    editingProfileId: ref<string | null>(null),
    editName: ref(''),
    refreshProfiles: async () => {},
    openProfile: async () => {},
    selectProfile: async () => {},
    switchProfile: async () => {},
    createLocalAccount: async () => {},
    renameProfile: async () => {},
    removeProfile: async () => {},
  };
}

const meta = {
  title: 'Business/AppVue/DesktopProfileList',
  component: DesktopProfileList,
  tags: ['autodocs'],
  args: { management: false },
  render: (args) => ({
    components: { DesktopProfileList },
    setup() {
      return {
        args,
        presenter: createPresenter('profile-local-1') as unknown as ReturnType<
          typeof useDesktopProfiles
        >,
      };
    },
    template: `
      <div class="w-[40rem] rounded-xl border bg-background p-6">
        <DesktopProfileList v-bind="args" :presenter="presenter" />
      </div>
    `,
  }),
} satisfies Meta<typeof DesktopProfileList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AccessTiles: Story = {};

export const TileCardOpen: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const tile = page.getByTestId('desktop-profile-open-profile-local-2');
    tile.focus();
    await page.findByTestId('desktop-profile-menu-profile-local-2');
    await userEvent.click(page.getByTestId('desktop-profile-remove-profile-local-2'));
  },
};

export const Management: Story = {
  args: { management: true },
  render: (args) => ({
    components: { DesktopProfileList },
    setup() {
      function presenter() {
        const fake = createPresenter('profile-local-1');
        fake.editingProfileId.value = 'profile-local-1';
        fake.editName.value = 'Personal';
        return fake;
      }
      return {
        args,
        presenter: presenter() as unknown as ReturnType<typeof useDesktopProfiles>,
      };
    },
    template: `
      <div class="w-[40rem] rounded-xl border bg-background p-6">
        <DesktopProfileList v-bind="args" :presenter="presenter" />
      </div>
    `,
  }),
};
