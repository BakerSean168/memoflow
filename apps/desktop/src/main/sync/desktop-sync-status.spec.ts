import { describe, expect, it, vi } from 'vitest';
import type { DesktopSyncSnapshotDTO } from '@memoflow/desktop-contracts';
import type { SafeSyncHealth } from '../database/powersync-health';
import type { PendingProfileSyncState } from '@memoflow/account/electron';
import {
  DesktopSyncStatusService,
  registerDesktopSyncStatusIpc,
  type DesktopSyncStatusBusinessPort,
  type DesktopSyncStatusIpcBroadcastPort,
  type DesktopSyncStatusIpcMainPort,
  type DesktopSyncStatusProfilePort,
} from './desktop-sync-status';

function profileState(overrides: Partial<PendingProfileSyncState> = {}): PendingProfileSyncState {
  return {
    pending: false,
    revision: null,
    lastSyncedAt: 1_700_000_000_000,
    fields: [],
    failureCategory: null,
    ...overrides,
  };
}

function createHarness(health: SafeSyncHealth = { phase: 'synced', hasSynced: true }) {
  let currentHealth = health;
  let currentProfile = profileState();
  const healthListeners = new Set<(value: SafeSyncHealth) => void>();
  const profileListeners = new Set<() => void>();

  const profile: DesktopSyncStatusProfilePort = {
    getState: vi.fn(async () => currentProfile),
    flush: vi.fn(async () => true),
    subscribe: vi.fn((listener) => {
      profileListeners.add(listener);
      return () => profileListeners.delete(listener);
    }),
  };
  const business: DesktopSyncStatusBusinessPort = {
    getHealth: vi.fn(() => currentHealth),
    refresh: vi.fn(() => {
      for (const listener of healthListeners) listener(currentHealth);
    }),
    subscribe: vi.fn((listener) => {
      healthListeners.add(listener);
      listener(currentHealth);
      return () => healthListeners.delete(listener);
    }),
  };

  const service = new DesktopSyncStatusService(profile, business);
  service.start();

  return {
    service,
    profile,
    business,
    setHealth(next: SafeSyncHealth) {
      currentHealth = next;
      for (const listener of healthListeners) listener(next);
    },
    setProfile(next: PendingProfileSyncState) {
      currentProfile = next;
      for (const listener of profileListeners) listener();
    },
  };
}

describe('DesktopSyncStatusService', () => {
  it('projects a sanitized snapshot without outbox internals or error messages', async () => {
    const harness = createHarness({
      phase: 'download_error',
      hasSynced: false,
      lastSyncedAt: 1_700_000_000_000,
      errorType: 'FetchError',
      errorCode: 'PSYNC_S2106',
      httpStatus: 401,
    });
    harness.setProfile(
      profileState({
        pending: true,
        revision: 9,
        fields: [{ field: 'nickname', value: 'New Name' }],
        failureCategory: 'validation',
      }),
    );

    const snapshot = await harness.service.getSnapshot();

    expect(snapshot).toEqual({
      business: {
        phase: 'download_error',
        hasSynced: false,
        lastSyncedAt: 1_700_000_000_000,
        errorCategory: 'authorization',
        pending: false,
      },
      profile: {
        pendingFields: [{ field: 'nickname', value: 'New Name' }],
        lastSyncedAt: 1_700_000_000_000,
        failureCategory: 'validation',
      },
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('PSYNC_S2106');
    expect(serialized).not.toContain('FetchError');
    expect(serialized).not.toContain('revision');
  });

  it('counts an unsynced business dataset as pending without inventing row counts', async () => {
    const harness = createHarness({ phase: 'connecting', hasSynced: false });

    await expect(harness.service.getSnapshot()).resolves.toMatchObject({
      business: { pending: true, errorCategory: null },
      profile: { pendingFields: [] },
    });

    harness.setHealth({ phase: 'synced', hasSynced: true, lastSyncedAt: 10 });
    await expect(harness.service.getSnapshot()).resolves.toMatchObject({
      business: { pending: false, lastSyncedAt: 10 },
    });
  });

  it('flushes the profile intent, refreshes business status and publishes the result', async () => {
    const harness = createHarness({ phase: 'connecting', hasSynced: false });
    const listener = vi.fn();
    harness.service.subscribe(listener);

    await harness.service.syncNow();

    expect(harness.profile.flush).toHaveBeenCalledOnce();
    expect(harness.business.refresh).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        business: expect.objectContaining({ phase: 'connecting' }),
      }),
    );
  });

  it('broadcasts when either the profile intent or business status changes', async () => {
    const harness = createHarness();
    const listener = vi.fn();
    harness.service.subscribe(listener);

    harness.setProfile(profileState({ pending: true, fields: [{ field: 'bio', value: 'x' }] }));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    harness.setHealth({ phase: 'download_error', hasSynced: true });
    await vi.waitFor(() =>
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          business: expect.objectContaining({ errorCategory: 'unknown' }),
        }),
      ),
    );
  });
});

describe('registerDesktopSyncStatusIpc', () => {
  it('registers only sanitized snapshot channels and broadcasts schema-valid payloads', async () => {
    const harness = createHarness();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc: DesktopSyncStatusIpcMainPort = {
      handle: vi.fn((channel, listener) => {
        handlers.set(channel, listener);
      }),
      removeHandler: vi.fn((channel) => {
        handlers.delete(channel);
      }),
    };
    const broadcast: DesktopSyncStatusIpcBroadcastPort = { send: vi.fn() };
    const runtime = registerDesktopSyncStatusIpc({ snapshot: harness.service, ipc, broadcast });

    const result = (await handlers.get('sync-status:get-snapshot')!()) as {
      ok: boolean;
      data: DesktopSyncSnapshotDTO;
    };
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data).sort()).toEqual(['business', 'profile']);

    harness.setHealth({ phase: 'synced', hasSynced: true });
    await vi.waitFor(() => expect(broadcast.send).toHaveBeenCalled());
    const [channel, payload] = (broadcast.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(channel).toBe('sync-status:state-changed');
    expect(Object.keys(payload as object).sort()).toEqual(['business', 'profile']);

    runtime.destroy();
    expect(handlers.size).toBe(0);
  });
});
