import { describe, expect, it, vi } from 'vitest';
import { SyncStatusChannels, type DesktopSyncSnapshotDTO } from '@memoflow/desktop-contracts';
import { ok, ResultCode } from '@memoflow/transport-contracts/result';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';
import { createDesktopSyncStatusService } from './desktop-sync-status-service';

function snapshot(): DesktopSyncSnapshotDTO {
  return {
    business: {
      phase: 'synced',
      hasSynced: true,
      lastSyncedAt: 1_700_000_000_000,
      errorCategory: null,
      pending: false,
    },
    profile: {
      pendingFields: [{ field: 'nickname', value: 'New Name' }],
      lastSyncedAt: null,
      failureCategory: null,
    },
  };
}

function createHarness() {
  const invoke = vi.fn();
  const ipc: IResultIpcClient = {
    invoke: invoke as IResultIpcClient['invoke'],
  };
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const bridge: ElectronBridge = {
    invoke: vi.fn(),
    on: vi.fn((channel, callback) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(callback);
      listeners.set(channel, channelListeners);
    }),
    off: vi.fn((channel, callback) => {
      listeners.get(channel)?.delete(callback);
    }),
  };

  return {
    invoke,
    bridge,
    service: createDesktopSyncStatusService(ipc, bridge),
    emit(channel: string, payload: unknown) {
      for (const listener of listeners.get(channel) ?? []) listener(payload);
    },
  };
}

describe('createDesktopSyncStatusService', () => {
  it('maps snapshot and sync-now to the canonical IPC channels', async () => {
    const harness = createHarness();
    const current = snapshot();
    harness.invoke.mockResolvedValue(ok(current));

    await expect(harness.service.getSnapshot()).resolves.toEqual(ok(current));
    await expect(harness.service.syncNow()).resolves.toEqual(ok(current));

    expect(harness.invoke.mock.calls).toEqual([
      [SyncStatusChannels.GET_SNAPSHOT],
      [SyncStatusChannels.SYNC_NOW],
    ]);
  });

  it('fails closed on a malformed snapshot without leaking it', async () => {
    const harness = createHarness();
    harness.invoke.mockResolvedValue(
      ok({ business: {}, profile: {}, owner_id: 'cloud-1', error: 'secret-token' }),
    );

    const result = await harness.service.getSnapshot();

    expect(result).toEqual({
      ok: false,
      error: {
        code: ResultCode.INTERNAL_ERROR,
        message: 'Sync status returned an invalid snapshot.',
      },
      meta: undefined,
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('forwards only validated STATE_CHANGED snapshots', () => {
    const harness = createHarness();
    const listener = vi.fn();
    harness.service.subscribe(listener);

    harness.emit(SyncStatusChannels.STATE_CHANGED, {
      ...snapshot(),
      owner_id: 'cloud-1',
    });
    expect(listener).not.toHaveBeenCalled();

    const current = snapshot();
    harness.emit(SyncStatusChannels.STATE_CHANGED, current);
    expect(listener).toHaveBeenCalledWith(current);
  });
});
