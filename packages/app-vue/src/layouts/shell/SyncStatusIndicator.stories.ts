import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ok } from '@memoflow/transport-contracts/result';
import type { DesktopSyncSnapshotDTO, ProfileCloudState } from '@memoflow/desktop-contracts';
import SyncStatusIndicator from './SyncStatusIndicator.vue';
import { DESKTOP_SYNC_STATUS_SERVICE_KEY } from '../../di/keys';
import type { DesktopSyncStatusService } from '../../di/types';

const lastSyncedAt = 1_763_000_000_000;

function snapshot(
  overrides: {
    business?: Partial<DesktopSyncSnapshotDTO['business']>;
    profile?: Partial<DesktopSyncSnapshotDTO['profile']>;
  } = {},
): DesktopSyncSnapshotDTO {
  return {
    business: {
      phase: 'synced',
      hasSynced: true,
      lastSyncedAt,
      errorCategory: null,
      pending: false,
      ...overrides.business,
    },
    profile: {
      pendingFields: [],
      lastSyncedAt: null,
      failureCategory: null,
      ...overrides.profile,
    },
  };
}

function createService(
  initial: DesktopSyncSnapshotDTO,
  options: { busy?: boolean } = {},
): DesktopSyncStatusService {
  return {
    getSnapshot: async () => ok(initial),
    syncNow: () =>
      options.busy
        ? new Promise<Awaited<ReturnType<DesktopSyncStatusService['syncNow']>>>(() => undefined)
        : Promise.resolve(ok(initial)),
    subscribe: () => () => undefined,
  };
}

interface FrameOptions {
  snapshot: DesktopSyncSnapshotDTO;
  cloudState?: ProfileCloudState;
  avatarPending?: boolean;
  avatarAlignedAt?: number | null;
  busy?: boolean;
  width?: string;
}

function renderIndicator(options: FrameOptions) {
  const service = createService(options.snapshot, { busy: options.busy });
  return {
    components: { SyncStatusIndicator },
    setup() {
      provide(DESKTOP_SYNC_STATUS_SERVICE_KEY, service);
      return { props: options };
    },
    template: `
      <div class="bg-background p-6">
        <div class="${options.width ?? 'w-[30rem]'} overflow-hidden rounded-xl border shadow-sm">
          <div class="flex h-11 items-center justify-between border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.6)] px-4">
            <span class="text-xs font-medium text-muted-foreground">Workspace header</span>
            <SyncStatusIndicator
              :cloud-account-bound="true"
              :cloud-state="props.cloudState ?? 'ONLINE'"
              :avatar-pending="props.avatarPending ?? false"
              :avatar-aligned-at="props.avatarAlignedAt ?? null"
            />
          </div>
          <div class="h-72 bg-[hsl(var(--workspace-business))] p-4">
            <p class="text-xs text-muted-foreground">The indicator sits in the shell header.</p>
          </div>
        </div>
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/SyncStatusIndicator',
  component: SyncStatusIndicator,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () => renderIndicator({ snapshot: snapshot() }),
} satisfies Meta<typeof SyncStatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Synced: no badge, and the tooltip carries the last successful sync time. */
export const Synced: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByTestId('sync-status-indicator');
    await expect(trigger).toHaveAttribute('data-state', 'synced');
    await expect(trigger.getAttribute('title')).toContain('last sync');
    await expect(page.queryByTestId('sync-status-badge')).not.toBeInTheDocument();
  },
};

/** Pending: the badge counts profile fields, the avatar upload and one business row. */
export const PendingDetails: Story = {
  render: () =>
    renderIndicator({
      snapshot: snapshot({
        business: { phase: 'connecting', hasSynced: false, lastSyncedAt: null, pending: true },
        profile: {
          pendingFields: [
            { field: 'nickname', value: 'Alex Rivera' },
            { field: 'bio', value: '' },
          ],
        },
      }),
      avatarPending: true,
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('sync-status-indicator'));
    await page.findByTestId('sync-status-popover');
    await expect(page.getByTestId('sync-status-badge')).toHaveTextContent('4');
    await expect(page.getByTestId('sync-status-profile-item-nickname')).toHaveTextContent(
      'Alex Rivera',
    );
    await expect(page.getByTestId('sync-status-profile-item-bio')).toHaveTextContent('Changed');
    await expect(page.getByTestId('sync-status-profile-item-avatar')).toHaveTextContent(
      'New avatar waiting to upload',
    );
    await expect(page.getByTestId('sync-status-business-phase')).toHaveTextContent('Connecting');
  },
};

/** Offline: pending profile data stays visible beside the offline explanation. */
export const OfflineDetails: Story = {
  render: () =>
    renderIndicator({
      cloudState: 'OFFLINE',
      snapshot: snapshot({
        profile: { pendingFields: [{ field: 'nickname', value: 'Alex Rivera' }] },
      }),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('sync-status-indicator'));
    await page.findByTestId('sync-status-popover');
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
      'data-state',
      'offline',
    );
    await expect(page.getByTestId('sync-status-offline-note')).toHaveTextContent('stored locally');
  },
};

/** Error: an expired sign-in keeps the audit category and a red alert badge. */
export const ErrorDetails: Story = {
  render: () =>
    renderIndicator({
      cloudState: 'REAUTH_REQUIRED',
      snapshot: snapshot({
        business: {
          phase: 'download_error',
          hasSynced: false,
          lastSyncedAt: null,
          pending: false,
          errorCategory: 'authorization',
        },
      }),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('sync-status-indicator'));
    await page.findByTestId('sync-status-popover');
    await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute('data-state', 'error');
    await expect(page.getByTestId('sync-status-error')).toHaveTextContent('Sign-in expired');
    await waitFor(() => expect(page.getByTestId('sync-status-sync-now')).toBeVisible());
  },
};

/** The avatar reconciliation notice offers an inline dismiss action. */
export const AvatarAlignmentNotice: Story = {
  render: () =>
    renderIndicator({
      snapshot: snapshot(),
      avatarAlignedAt: lastSyncedAt - 60_000,
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('sync-status-indicator'));
    await page.findByTestId('sync-status-popover');
    await expect(page.getByTestId('sync-status-aligned')).toHaveTextContent(
      'Aligned with a newer cloud version',
    );
    await expect(page.getByTestId('sync-status-dismiss-aligned')).toBeVisible();
  },
};

/** While the manual sync is in flight the action shows its busy label and spinner. */
export const SyncNowBusy: Story = {
  render: () => renderIndicator({ snapshot: snapshot(), busy: true }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('sync-status-indicator'));
    const syncNow = await page.findByTestId('sync-status-sync-now');
    await userEvent.click(syncNow);
    await waitFor(() =>
      expect(page.getByTestId('sync-status-sync-now')).toHaveTextContent('Syncing'),
    );
    await expect(page.getByTestId('sync-status-sync-now')).toBeDisabled();
  },
};
