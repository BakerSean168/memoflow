import { BrowserWindow, ipcMain } from 'electron';
import {
  DesktopUpdateChannels,
  DesktopUpdateSnapshotSchema,
  type DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DesktopUpdateIpc');

export interface DesktopUpdateIpcUpdatePort {
  getSnapshot(): DesktopUpdateSnapshotDTO;
  check(intent: 'explicit'): Promise<DesktopUpdateSnapshotDTO>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshotDTO) => void): () => void;
}

export interface DesktopUpdateIpcInstallPort {
  requestRestartAndInstall(): Promise<DesktopUpdateSnapshotDTO>;
}

export interface DesktopUpdateIpcMainPort {
  handle(channel: string, listener: (...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface DesktopUpdateIpcBroadcastPort {
  send(channel: string, payload: DesktopUpdateSnapshotDTO): void;
}

export interface DesktopUpdateIpcOptions {
  readonly update: DesktopUpdateIpcUpdatePort;
  readonly install: DesktopUpdateIpcInstallPort;
  readonly ipc?: DesktopUpdateIpcMainPort;
  readonly broadcast?: DesktopUpdateIpcBroadcastPort;
}

export interface DesktopUpdateIpcRuntime {
  destroy(): void;
}

const IPC_CHANNELS = [
  DesktopUpdateChannels.GET_SNAPSHOT,
  DesktopUpdateChannels.CHECK,
  DesktopUpdateChannels.RESTART_AND_INSTALL,
] as const;

function defaultBroadcast(): DesktopUpdateIpcBroadcastPort {
  return {
    send(channel, payload) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
        window.webContents.send(channel, payload);
      }
    },
  };
}

function internalFailure() {
  return fail({
    code: 'INTERNAL_ERROR',
    message: 'Desktop update operation failed.',
  });
}

function safeSnapshot(snapshot: DesktopUpdateSnapshotDTO): DesktopUpdateSnapshotDTO {
  return DesktopUpdateSnapshotSchema.parse(snapshot);
}

/**
 * Canonical process-owned Desktop Update IPC bridge.
 *
 * Only renderer-safe snapshots cross this boundary. Feed/provider configuration,
 * native updater errors, file paths, and a standalone download command are
 * intentionally absent.
 */
export function registerDesktopUpdateIpc(
  options: DesktopUpdateIpcOptions,
): DesktopUpdateIpcRuntime {
  const mainIpc = options.ipc ?? ipcMain;
  const broadcast = options.broadcast ?? defaultBroadcast();
  let destroyed = false;

  mainIpc.handle(DesktopUpdateChannels.GET_SNAPSHOT, () => {
    try {
      return ok(safeSnapshot(options.update.getSnapshot()));
    } catch (error) {
      logger.error('Desktop Update snapshot IPC failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return internalFailure();
    }
  });

  mainIpc.handle(DesktopUpdateChannels.CHECK, async () => {
    try {
      return ok(safeSnapshot(await options.update.check('explicit')));
    } catch (error) {
      logger.error('Desktop Update check IPC failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return internalFailure();
    }
  });

  mainIpc.handle(DesktopUpdateChannels.RESTART_AND_INSTALL, async () => {
    try {
      return ok(safeSnapshot(await options.install.requestRestartAndInstall()));
    } catch (error) {
      logger.error('Desktop Update install IPC failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return internalFailure();
    }
  });

  const unsubscribe = options.update.subscribe((snapshot) => {
    if (destroyed) return;
    try {
      broadcast.send(DesktopUpdateChannels.STATE_CHANGED, safeSnapshot(snapshot));
    } catch (error) {
      logger.warn('Desktop Update state broadcast dropped invalid snapshot', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  });

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      for (const channel of IPC_CHANNELS) {
        mainIpc.removeHandler(channel);
      }
    },
  });
}
