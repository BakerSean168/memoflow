/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import type { DesktopSyncSnapshotDTO, ProfileCloudState } from '@memoflow/desktop-contracts';
import { DESKTOP_SYNC_STATUS_SERVICE_KEY } from '../../di/keys';
import type { DesktopSyncStatusService } from '../../di/types';
import SyncStatusIndicator from './SyncStatusIndicator.vue';
import { installShellTestCleanup } from '../../test/shell-cleanup';
import enShell from '../../locales/en-US/shell';
import zhShell from '../../locales/zh-CN/shell';

installShellTestCleanup();

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': { shell: enShell },
    'zh-CN': { shell: zhShell },
  },
});

const popoverStubs = {
  Popover: {
    props: ['open'],
    emits: ['update:open'],
    template: '<div data-testid="popover"><slot /></div>',
  },
  PopoverTrigger: {
    template: '<div><slot /></div>',
  },
  PopoverContent: {
    template: '<div><slot /></div>',
  },
};

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
      lastSyncedAt: 1_700_000_000_000,
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

function createService(initial: DesktopSyncSnapshotDTO) {
  const listeners = new Set<(value: DesktopSyncSnapshotDTO) => void>();
  const service: DesktopSyncStatusService = {
    getSnapshot: vi.fn(async () => ok(initial)),
    syncNow: vi.fn(async () => ok(initial)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    service,
    emit(next: DesktopSyncSnapshotDTO) {
      for (const listener of listeners) listener(next);
    },
  };
}

function mountIndicator(
  options: {
    snapshot?: DesktopSyncSnapshotDTO;
    service?: DesktopSyncStatusService | null;
    cloudAccountBound?: boolean;
    cloudState?: ProfileCloudState;
    avatarPending?: boolean;
    avatarAlignedAt?: number | null;
  } = {},
) {
  const harness = createService(options.snapshot ?? snapshot());
  return {
    harness,
    wrapper: mount(SyncStatusIndicator, {
      props: {
        cloudAccountBound: options.cloudAccountBound ?? true,
        cloudState: options.cloudState ?? 'ONLINE',
        avatarPending: options.avatarPending ?? false,
        avatarAlignedAt: options.avatarAlignedAt ?? null,
      },
      global: {
        plugins: [i18n],
        provide: {
          ...(options.service === null
            ? {}
            : { [DESKTOP_SYNC_STATUS_SERVICE_KEY as symbol]: options.service ?? harness.service }),
        },
        stubs: popoverStubs,
      },
    }),
  };
}

describe('SyncStatusIndicator', () => {
  it('renders nothing for a local account or without the host capability', async () => {
    const local = mountIndicator({ cloudAccountBound: false });
    await flushPromises();
    expect(local.wrapper.find('[data-testid="sync-status-indicator"]').exists()).toBe(false);

    const web = mountIndicator({ service: null });
    await flushPromises();
    expect(web.wrapper.find('[data-testid="sync-status-indicator"]').exists()).toBe(false);
  });

  it('shows the synced state without a badge and the latest sync time', async () => {
    const { wrapper } = mountIndicator();
    await flushPromises();

    const button = wrapper.get('[data-testid="sync-status-indicator"]');
    expect(button.attributes('data-state')).toBe('synced');
    expect(wrapper.find('[data-testid="sync-status-badge"]').exists()).toBe(false);
    expect(button.attributes('title')).toContain('last sync');
    expect(wrapper.get('[data-testid="sync-status-all-synced"]').text()).toContain(
      'Everything is synced',
    );
  });

  it('shows a numeric badge and both profile and business pending entries', async () => {
    const { wrapper } = mountIndicator({
      snapshot: snapshot({
        business: { phase: 'connecting', hasSynced: false, lastSyncedAt: null, pending: true },
        profile: {
          pendingFields: [
            { field: 'nickname', value: 'Next Name' },
            { field: 'bio', value: '' },
          ],
        },
      }),
      avatarPending: true,
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="sync-status-indicator"]').attributes('data-state')).toBe(
      'pending',
    );
    expect(wrapper.get('[data-testid="sync-status-badge"]').text()).toBe('4');
    expect(wrapper.get('[data-testid="sync-status-profile-item-nickname"]').text()).toContain(
      'Next Name',
    );
    expect(wrapper.get('[data-testid="sync-status-profile-item-bio"]').text()).toContain('Changed');
    expect(wrapper.get('[data-testid="sync-status-profile-item-avatar"]').text()).toContain(
      'New avatar waiting to upload',
    );
    expect(wrapper.get('[data-testid="sync-status-business-phase"]').text()).toBe('Connecting');
  });

  it('renders the offline note while keeping pending items visible', async () => {
    const { wrapper } = mountIndicator({
      cloudState: 'OFFLINE',
      snapshot: snapshot({
        profile: { pendingFields: [{ field: 'nickname', value: 'Next Name' }] },
      }),
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="sync-status-indicator"]').attributes('data-state')).toBe(
      'offline',
    );
    expect(wrapper.get('[data-testid="sync-status-offline-note"]').text()).toContain(
      'Server unreachable',
    );
    expect(wrapper.find('[data-testid="sync-status-profile-item-nickname"]').exists()).toBe(true);
  });

  it('renders the error category and retries through the canonical sync action', async () => {
    const { wrapper, harness } = mountIndicator({
      snapshot: snapshot({
        business: { phase: 'download_error', errorCategory: 'authorization' },
      }),
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="sync-status-indicator"]').attributes('data-state')).toBe(
      'error',
    );
    expect(wrapper.get('[data-testid="sync-status-error"]').text()).toContain('Sign-in expired');

    await wrapper.get('[data-testid="sync-status-sync-now"]').trigger('click');
    await flushPromises();

    expect(harness.service.syncNow).toHaveBeenCalledOnce();
    expect(wrapper.emitted('request-avatar-refresh')).toHaveLength(1);
  });

  it('renders and dismisses the cloud-aligned record', async () => {
    const alignedAt = Date.parse('2026-11-07T09:30:00.000Z');
    const { wrapper } = mountIndicator({ avatarAlignedAt: alignedAt });
    await flushPromises();

    expect(wrapper.get('[data-testid="sync-status-aligned"]').text()).toContain(
      'Aligned with a newer cloud version',
    );

    await wrapper.get('[data-testid="sync-status-dismiss-aligned"]').trigger('click');
    expect(wrapper.emitted('dismiss-avatar-alignment')).toHaveLength(1);
  });
});
