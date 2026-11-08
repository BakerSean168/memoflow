import {
  DesktopSyncSnapshotSchema,
  SyncStatusChannels,
  type DesktopSyncSnapshotDTO,
} from '@memoflow/desktop-contracts';
import { fail, ok, ResultCode, type Result } from '@memoflow/transport-contracts/result';
import type { DesktopSyncStatusService } from '@memoflow/app-vue/di';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';

const INVALID_SNAPSHOT_MESSAGE = 'Sync status returned an invalid snapshot.';

async function invokeSnapshot(
  ipc: IResultIpcClient,
  channel: string,
): Promise<Result<DesktopSyncSnapshotDTO>> {
  const result = await ipc.invoke<unknown>(channel);
  if (!result.ok) return result;

  const parsed = DesktopSyncSnapshotSchema.safeParse(result.data);
  if (!parsed.success) {
    return fail(
      {
        code: ResultCode.INTERNAL_ERROR,
        message: INVALID_SNAPSHOT_MESSAGE,
      },
      result.meta,
    );
  }
  return ok(parsed.data, result.meta);
}

/**
 * Desktop renderer adapter for the host-neutral DesktopSyncStatusService port.
 * Only renderer-safe snapshots cross this boundary.
 */
export function createDesktopSyncStatusService(
  ipc: IResultIpcClient,
  bridge: ElectronBridge,
): DesktopSyncStatusService {
  return Object.freeze({
    getSnapshot: () => invokeSnapshot(ipc, SyncStatusChannels.GET_SNAPSHOT),
    syncNow: () => invokeSnapshot(ipc, SyncStatusChannels.SYNC_NOW),

    subscribe(listener: (snapshot: DesktopSyncSnapshotDTO) => void) {
      let active = true;
      const onStateChanged = (...args: unknown[]) => {
        if (!active) return;
        const parsed = DesktopSyncSnapshotSchema.safeParse(args[0]);
        if (!parsed.success) return;
        listener(parsed.data);
      };

      bridge.on(SyncStatusChannels.STATE_CHANGED, onStateChanged);

      return () => {
        if (!active) return;
        active = false;
        bridge.off(SyncStatusChannels.STATE_CHANGED, onStateChanged);
      };
    },
  });
}
