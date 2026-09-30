import {
  DesktopUpdateChannels,
  DesktopUpdateSnapshotSchema,
  type DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { fail, ok, ResultCode, type Result } from '@memoflow/contracts/result';
import type { DesktopUpdateService } from '@memoflow/app-vue/di';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';

const INVALID_SNAPSHOT_MESSAGE = 'Desktop update returned an invalid snapshot.';

async function invokeSnapshot(
  ipc: IResultIpcClient,
  channel: string,
): Promise<Result<DesktopUpdateSnapshotDTO>> {
  const result = await ipc.invoke<unknown>(channel);
  if (!result.ok) return result;

  const parsed = DesktopUpdateSnapshotSchema.safeParse(result.data);
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
 * Desktop renderer adapter for the host-neutral DesktopUpdateService port.
 *
 * The adapter is the only renderer layer that knows the Desktop Update IPC
 * channels. Shared app-vue consumers only see validated snapshots and Result
 * envelopes.
 */
export function createDesktopUpdateService(
  ipc: IResultIpcClient,
  bridge: ElectronBridge,
): DesktopUpdateService {
  return Object.freeze({
    getSnapshot: () => invokeSnapshot(ipc, DesktopUpdateChannels.GET_SNAPSHOT),
    check: () => invokeSnapshot(ipc, DesktopUpdateChannels.CHECK),
    restartAndInstall: () => invokeSnapshot(ipc, DesktopUpdateChannels.RESTART_AND_INSTALL),

    subscribe(listener: (snapshot: DesktopUpdateSnapshotDTO) => void) {
      let active = true;
      const onStateChanged = (...args: unknown[]) => {
        if (!active) return;

        const parsed = DesktopUpdateSnapshotSchema.safeParse(args[0]);
        if (!parsed.success) return;

        listener(parsed.data);
      };

      bridge.on(DesktopUpdateChannels.STATE_CHANGED, onStateChanged);

      return () => {
        if (!active) return;
        active = false;
        bridge.off(DesktopUpdateChannels.STATE_CHANGED, onStateChanged);
      };
    },
  });
}
