import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useAccountStore } from '@memoflow/account-ui';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import ConversationSidebar from './ConversationSidebar.vue';

const now = 1_763_000_000_000;

const groups = [
  {
    labelKey: 'shell.conversation.today',
    items: [
      { id: 'conversation-1', title: 'Personal systems architecture' },
      { id: 'conversation-2', title: 'Quarterly planning notes' },
    ],
  },
  {
    labelKey: 'shell.conversation.last7Days',
    items: [{ id: 'conversation-3', title: 'Training plan for the half marathon' }],
  },
  {
    labelKey: 'shell.conversation.earlier',
    items: [{ id: 'conversation-4', title: 'Infrastructure migration checklist' }],
  },
];

const profiles: ProfileSummary[] = [
  {
    profileId: 'profile-local-1',
    profileKind: 'local',
    displayName: 'Personal',
    avatarSeed: 'personal',
    avatarUrl: null,
    identifierHint: null,
    cloudAccountId: null,
    lastActiveAt: now,
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
    lastActiveAt: now - 1_000,
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
    lastActiveAt: now - 2_000,
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
    lastActiveAt: now - 3_000,
    hasCredential: true,
    remembered: false,
  },
];

/** Many accounts exercise the bounded, scrollable switch-account menu. */
const manyProfiles: ProfileSummary[] = Array.from({ length: 9 }, (_, index) => {
  const cloud = index % 2 === 1;
  return {
    profileId: `profile-${index}`,
    profileKind: cloud ? 'registered' : 'local',
    displayName: `Workspace ${index + 1}`,
    avatarSeed: `workspace-${index}`,
    avatarUrl: null,
    identifierHint: cloud ? `workspace-${index + 1}@example.com` : null,
    cloudAccountId: cloud ? `cloud-account-${index}` : null,
    lastActiveAt: now - index * 1_000,
    hasCredential: index === 2 || index === 5,
    remembered: false,
  } satisfies ProfileSummary;
});

function renderSidebar(props: Record<string, unknown>) {
  return {
    components: { ConversationSidebar },
    setup() {
      // The account store is shared across stories; start from a clean identity.
      useAccountStore().reset();
      return { props };
    },
    template: `
      <div class="h-[36rem] w-[18rem] border-r bg-background p-2">
        <ConversationSidebar v-bind="props" />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/ConversationSidebar',
  component: ConversationSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    groups,
    activeConversationId: 'conversation-1',
    userName: 'Alice',
    isDesktop: true,
    identityKind: 'local',
    profiles,
    activeProfileId: 'profile-local-1',
  },
  render: (args) => renderSidebar(args as unknown as Record<string, unknown>),
} satisfies Meta<typeof ConversationSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default footer: the account block names the active identity without a menu. */
export const AccountCardDefault: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('shell-account-name')).toHaveTextContent('Alice');
    await expect(page.queryByTestId('shell-account-card-panel')).not.toBeInTheDocument();
  },
};

/** The local account menu: identity line, profile editor, switch and sign out. */
export const AccountMenuLocal: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('shell-account-card'));
    await page.findByTestId('shell-account-card-panel');
    await expect(page.getByTestId('shell-account-card-name')).toHaveTextContent('Alice');
    await expect(page.getByTestId('shell-account-card-kind')).toHaveTextContent('Local account');
    await expect(page.getByTestId('shell-edit-profile')).toBeVisible();
    await expect(page.getByTestId('shell-switch-account')).toBeVisible();
    await expect(page.getByTestId('shell-logout')).toBeVisible();
    await expect(page.queryByTestId('shell-account-card-status')).not.toBeInTheDocument();
  },
};

/** A connected cloud account adds the email row and the online status dot. */
export const AccountMenuCloud: Story = {
  args: {
    identityKind: 'cloud',
    cloudConnected: true,
    cloudState: 'ONLINE',
    accountEmail: 'alice@example.com',
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('shell-account-card'));
    await page.findByTestId('shell-account-card-panel');
    await expect(page.getByTestId('shell-account-card-email')).toHaveTextContent(
      'alice@example.com',
    );
    await expect(page.getByTestId('shell-account-card-status')).toBeVisible();
    await expect(page.queryByTestId('shell-account-card-kind')).not.toBeInTheDocument();
    await expect(page.getByTestId('shell-logout')).toBeVisible();
  },
};

/** A signed-out cloud-bound local account offers the reauthentication entry. */
export const AccountMenuDisconnected: Story = {
  args: {
    identityKind: 'registered-local',
    cloudConnected: false,
    isDesktop: false,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('shell-account-card'));
    await page.findByTestId('shell-account-card-panel');
    await expect(page.getByTestId('shell-account-card-kind')).toHaveTextContent('Local account');
    await expect(page.getByTestId('shell-open-cloud-connection')).toHaveTextContent(
      'Reauthenticate this account',
    );
    await expect(page.queryByTestId('shell-logout')).not.toBeInTheDocument();
    await expect(page.queryByTestId('shell-switch-account')).not.toBeInTheDocument();
  },
};

/** The switch-account submenu lists bounded accounts and marks the current one. */
export const SwitchAccountSubmenu: Story = {
  args: {
    profiles: manyProfiles,
    activeProfileId: 'profile-3',
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('shell-account-card'));
    await page.findByTestId('shell-account-card-panel');
    await userEvent.click(page.getByTestId('shell-switch-account'));
    await page.findByTestId('shell-profile-switcher');
    const rows = page.getAllByTestId(/^shell-switch-profile-/);
    await expect(rows).toHaveLength(manyProfiles.length);
    await expect(page.getByTestId('shell-switch-profile-profile-3')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByTestId('shell-profile-list')).toHaveClass('overflow-y-auto');
    await expect(page.getByTestId('shell-add-account')).toHaveTextContent('Add account');
  },
};

/** Long names and addresses stay inside the fixed-width card and truncate. */
export const LongAccountName: Story = {
  args: {
    identityKind: 'cloud',
    cloudConnected: true,
    cloudState: 'ONLINE',
    userName: 'A very long account name that must never widen the personal card',
    accountEmail: 'a-very-long-cloud-address-that-must-never-widen-the-card@example.com',
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('shell-account-card'));
    await page.findByTestId('shell-account-card-panel');
    await expect(page.getByTestId('shell-account-card-name')).toHaveClass('truncate');
    await expect(page.getByTestId('shell-account-card-email')).toHaveClass('truncate');
    await expect(page.getByTestId('shell-account-card')).toHaveClass('min-w-0');
  },
};

/** Escape closes the card and returns focus to the account trigger. */
export const EscapeReturnsFocus: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByTestId('shell-account-card');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await page.findByTestId('shell-account-card-panel');
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(page.queryByTestId('shell-account-card-panel')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  },
};
