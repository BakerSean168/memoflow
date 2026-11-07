import { BrowserWindow, ipcMain } from 'electron';
import {
  DesktopSyncSnapshotSchema,
  SyncStatusChannels,
  type DesktopSyncSnapshotDTO,
} from '@memoflow/desktop-contracts';
import type { IElectronModule } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { PendingProfileSyncState } from '@memoflow/account/electron';
import { safeSyncErrorCategory, type SafeSyncHealth } from '../database/powersync-health';

const logger = createLogger('DesktopSyncStatus');

export interface DesktopSyncStatusProfilePort {
  getState(): Promise<PendingProfileSyncState>;
  flush(): Promise<boolean>;
  subscribe?(listener: () => void): () => void;
}

export interface DesktopSyncStatusBusinessPort {
  getHealth(): SafeSyncHealth;
  refresh(): void;
  subscribe(listener: (health: SafeSyncHealth) => void): () => void;
}

export interface DesktopSyncStatusSnapshotPort {
  getSnapshot(): Promise<DesktopSyncSnapshotDTO>;
  syncNow(): Promise<DesktopSyncSnapshotDTO>;
  subscribe(listener: (snapshot: DesktopSyncSnapshotDTO) => void): () => void;
}

export interface DesktopSyncStatusIpcMainPort {
  handle(channel: string, listener: (...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface DesktopSyncStatusIpcBroadcastPort {
  send(channel: string, payload: DesktopSyncSnapshotDTO): void;
}

export interface DesktopSyncStatusIpcOptions {
  readonly snapshot: DesktopSyncStatusSnapshotPort;
  readonly ipc?: DesktopSyncStatusIpcMainPort;
  readonly broadcast?: DesktopSyncStatusIpcBroadcastPort;
}

const IPC_CHANNELS = [SyncStatusChannels.GET_SNAPSHOT, SyncStatusChannels.SYNC_NOW] as const;

function defaultBroadcast(): DesktopSyncStatusIpcBroadcastPort {
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
    message: '同步状态读取失败',
  });
}

/** Coalesce profile and business events into one sanitized snapshot stream. */
export class DesktopSyncStatusService implements DesktopSyncStatusSnapshotPort {
  private readonly listeners = new Set<(snapshot: DesktopSyncSnapshotDTO) => void>();
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly profile: DesktopSyncStatusProfilePort,
    private readonly business: DesktopSyncStatusBusinessPort,
  ) {}

  async getSnapshot(): Promise<DesktopSyncSnapshotDTO> {
    const [profile, health] = await Promise.all([
      this.profile.getState(),
      Promise.resolve(this.business.getHealth()),
    ]);
    return DesktopSyncSnapshotSchema.parse({
      business: {
        phase: health.phase,
        hasSynced: health.hasSynced,
        lastSyncedAt: health.lastSyncedAt ?? null,
        errorCategory: safeSyncErrorCategory(health),
        pending: health.phase !== 'synced' && health.phase !== 'download_error',
      },
      profile: {
        pendingFields: profile.fields,
        lastSyncedAt: profile.lastSyncedAt,
        failureCategory: profile.failureCategory,
      },
    });
  }

  async syncNow(): Promise<DesktopSyncSnapshotDTO> {
    await this.profile.flush().catch(() => false);
    this.business.refresh();
    const snapshot = await this.getSnapshot();
    this.publish(snapshot);
    return snapshot;
  }

  subscribe(listener: (snapshot: DesktopSyncSnapshotDTO) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.disposers.length > 0) return;
    this.disposers.push(
      this.business.subscribe(() => {
        void this.broadcast();
      }),
    );
    const unsubscribeProfile = this.profile.subscribe?.(() => {
      void this.broadcast();
    });
    if (unsubscribeProfile) this.disposers.push(unsubscribeProfile);
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.listeners.clear();
  }

  private async broadcast(): Promise<void> {
    const snapshot = await this.getSnapshot();
    this.publish(snapshot);
  }

  private publish(snapshot: DesktopSyncSnapshotDTO): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        logger.warn('Sync status listener failed', {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }
  }
}

/** Register the process-owned sanitized sync status IPC bridge. */
export function registerDesktopSyncStatusIpc(options: DesktopSyncStatusIpcOptions): {
  destroy(): void;
} {
  const mainIpc = options.ipc ?? ipcMain;
  const broadcast = options.broadcast ?? defaultBroadcast();
  let destroyed = false;

  const safeSnapshot = (snapshot: DesktopSyncSnapshotDTO): DesktopSyncSnapshotDTO =>
    DesktopSyncSnapshotSchema.parse(snapshot);

  mainIpc.handle(SyncStatusChannels.GET_SNAPSHOT, async () => {
    try {
      return ok(safeSnapshot(await options.snapshot.getSnapshot()));
    } catch (error) {
      logger.error('Sync status snapshot IPC failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return internalFailure();
    }
  });

  mainIpc.handle(SyncStatusChannels.SYNC_NOW, async () => {
    try {
      return ok(safeSnapshot(await options.snapshot.syncNow()));
    } catch (error) {
      logger.error('Sync now IPC failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return internalFailure();
    }
  });

  const unsubscribe = options.snapshot.subscribe((snapshot) => {
    if (destroyed) return;
    try {
      broadcast.send(SyncStatusChannels.STATE_CHANGED, safeSnapshot(snapshot));
    } catch (error) {
      logger.warn('Sync status broadcast dropped invalid snapshot', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  });

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      for (const channel of IPC_CHANNELS) mainIpc.removeHandler(channel);
    },
  };
}

export interface DesktopSyncStatusModuleOptions {
  readonly profile: DesktopSyncStatusProfilePort;
  readonly business: DesktopSyncStatusBusinessPort;
}

/**
 * Per-Profile module: the profile database and PowerSync instance are only
 * valid while that Profile is active, so handlers follow the same lifecycle.
 */
export function createDesktopSyncStatusModule(
  options: DesktopSyncStatusModuleOptions,
): IElectronModule {
  let service: DesktopSyncStatusService | null = null;
  let ipc: { destroy(): void } | null = null;

  return {
    name: 'DesktopSyncStatus',
    register(): void {
      if (service) return;
      service = new DesktopSyncStatusService(options.profile, options.business);
      service.start();
      ipc = registerDesktopSyncStatusIpc({ snapshot: service });
    },
    destroy(): void {
      ipc?.destroy();
      ipc = null;
      service?.dispose();
      service = null;
    },
  };
}
