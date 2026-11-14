import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import type { ProfileAutoEnterSnapshot } from '@memoflow/desktop-contracts';
import { accountUiHost } from '../../account-ui-host';
import AccountAutoEnterSection from './AccountAutoEnterSection.vue';

const candidates = [
  { profileId: 'profile-work', displayName: 'Work profile', profileKind: 'local' as const },
  { profileId: 'profile-personal', displayName: 'Personal profile', profileKind: 'registered' as const },
];

const snapshot: ProfileAutoEnterSnapshot = {
  profileId: 'profile-work',
  candidates,
  suppressed: false,
};

function renderWithBridge(result: unknown) {
  return {
    components: { AccountAutoEnterSection },
    setup() {
      provide(accountUiHost.DESKTOP_BRIDGE_KEY as symbol, {
        invoke: async () => result,
      } as never);
      return {};
    },
    template: '<div style="max-width: 560px"><AccountAutoEnterSection /></div>',
  };
}

const meta = {
  title: 'Business/Account/AccountAutoEnterSection',
  component: AccountAutoEnterSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccountAutoEnterSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithBridge({ ok: true, data: snapshot }),
};

export const Off: Story = {
  render: () => renderWithBridge({ ok: true, data: { ...snapshot, profileId: null } }),
};

export const NoRememberedAccounts: Story = {
  render: () =>
    renderWithBridge({ ok: true, data: { ...snapshot, profileId: null, candidates: [] } }),
};

export const StaleTarget: Story = {
  render: () => renderWithBridge({ ok: true, data: { ...snapshot, profileId: 'profile-removed' } }),
};

export const LoadError: Story = {
  render: () => renderWithBridge({ ok: false }),
};
