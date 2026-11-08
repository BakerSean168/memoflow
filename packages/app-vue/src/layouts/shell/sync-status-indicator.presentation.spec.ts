import { describe, expect, it } from 'vitest';
import type { DesktopSyncSnapshotDTO } from '@memoflow/desktop-contracts';
import { presentSyncStatusIndicator } from './sync-status-indicator.presentation';

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

describe('presentSyncStatusIndicator', () => {
  it('renders nothing without a cloud-bound account or a loaded snapshot', () => {
    expect(
      presentSyncStatusIndicator({
        cloudAccountBound: false,
        snapshot: snapshot(),
        avatarPending: false,
      }),
    ).toBeNull();
    expect(
      presentSyncStatusIndicator({
        cloudAccountBound: true,
        snapshot: null,
        avatarPending: false,
      }),
    ).toBeNull();
  });

  it('reports synced with the latest timestamp and no badge', () => {
    const result = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'ONLINE',
      snapshot: snapshot({
        profile: { lastSyncedAt: 1_700_000_100_000 },
        business: { lastSyncedAt: 1_700_000_200_000 },
      }),
      avatarPending: false,
    });

    expect(result).toMatchObject({
      state: 'synced',
      badgeCount: null,
      showAlertBadge: false,
      lastSyncedAt: 1_700_000_200_000,
      showOfflineNote: false,
      profileItems: [],
    });
  });

  it('counts nickname, bio, avatar and the unsynced business dataset as separate items', () => {
    const result = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'ONLINE',
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

    expect(result).toMatchObject({ state: 'pending', badgeCount: 4 });
    expect(result?.profileItems.map((item) => item.id)).toEqual(['nickname', 'bio', 'avatar']);
    expect(result?.profileItems[0]).toMatchObject({ value: 'Next Name' });
    expect(result?.profileItems[1]).toMatchObject({ detailKey: 'shell.sync.profile.bioChanged' });
  });

  it('shows the offline state and keeps the pending list visible', () => {
    const result = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'OFFLINE',
      snapshot: snapshot({
        profile: { pendingFields: [{ field: 'nickname', value: 'Next Name' }] },
      }),
      avatarPending: false,
    });

    expect(result).toMatchObject({
      state: 'offline',
      badgeCount: null,
      showOfflineNote: true,
    });
    expect(result?.profileItems).toHaveLength(1);
  });

  it('shows an error for a rejected profile or business sync', () => {
    const profileError = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'ONLINE',
      snapshot: snapshot({ profile: { failureCategory: 'validation' } }),
      avatarPending: false,
    });
    expect(profileError).toMatchObject({
      state: 'error',
      showAlertBadge: true,
      errorCategory: 'validation',
    });

    const businessError = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'ONLINE',
      snapshot: snapshot({
        business: { phase: 'download_error', errorCategory: 'authorization' },
      }),
      avatarPending: false,
    });
    expect(businessError).toMatchObject({ state: 'error', errorCategory: 'authorization' });
  });

  it('treats network failures as offline before the connection badge refreshes', () => {
    const result = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'ONLINE',
      snapshot: snapshot({ business: { phase: 'download_error', errorCategory: 'network' } }),
      avatarPending: false,
    });

    expect(result).toMatchObject({ state: 'offline', showOfflineNote: true });
  });

  it('treats reauthentication as an authorization error even before a new failure lands', () => {
    const result = presentSyncStatusIndicator({
      cloudAccountBound: true,
      cloudState: 'REAUTH_REQUIRED',
      snapshot: snapshot(),
      avatarPending: false,
    });

    expect(result).toMatchObject({ state: 'error', showAlertBadge: true });
  });
});
