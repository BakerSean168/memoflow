import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { watch, type ChokidarOptions, type FSWatcher } from 'chokidar';
import {
  KnowledgeRemoteBindingClientSchema,
  type KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';
// Residual 957: isMissing/isTemporaryFile duals retired — sole repository electron vault-fs-guards.
import { isMissing, isTemporaryFile } from '@memoflow/repository/electron';
import { createLogger } from '@memoflow/utils/logger';
import type { DesktopKnowledgeRepositorySyncService } from './desktop-knowledge-repository-sync.service';
import type { KnowledgeRepositoryDesktopRemotePort } from './knowledge-repository-desktop-remote.port';
import { resolveReadyKnowledgeRemoteSyncState } from './knowledge-remote-binding-sync.policy';

const logger = createLogger('KnowledgeRepositoryAutoSync');
const DEFAULT_DEBOUNCE_MS = 2_500;
const DEFAULT_STABILITY_THRESHOLD_MS = 1_500;
const DEFAULT_SHUTDOWN_COMMIT_TIMEOUT_MS = 2_000;
const SYNC_RELEVANT_EVENTS = new Set(['add', 'change', 'unlink']);
const IGNORED_TOP_LEVEL_DIRECTORIES = new Set([
  '.git',
  '.memory-flow',
  '.obsidian',
  '.trash',
  '.Trash',
  'node_modules',
]);

interface StoredKnowledgeRepositoryAutoSyncState {
  schemaVersion: 2;
  connection: KnowledgeRemoteBindingClientDTO | null;
}

export interface KnowledgeRepositoryAutoSyncLifecyclePort {
  onNetworkOnline(listener: () => void): () => void;
  onSystemResume(listener: () => void): () => void;
}

export interface KnowledgeRepositoryAutoSyncExecutionPort {
  executeAutomatic: DesktopKnowledgeRepositorySyncService['executeAutomatic'];
  commitLocalChanges: DesktopKnowledgeRepositorySyncService['commitLocalChanges'];
}

export interface DesktopKnowledgeRepositoryAutoSyncSchedulerOptions {
  localVault: Pick<LocalVaultElectronPort, 'getBinding'>;
  remote: Pick<KnowledgeRepositoryDesktopRemotePort, 'listKnowledgeRepositoryConnections'>;
  synchronization: KnowledgeRepositoryAutoSyncExecutionPort;
  lifecycle?: KnowledgeRepositoryAutoSyncLifecyclePort;
  watchFactory?: (rootPath: string, options: ChokidarOptions) => FSWatcher;
  debounceMs?: number;
  stabilityThresholdMs?: number;
  shutdownCommitTimeoutMs?: number;
  stateFilePath?: string;
}

export interface KnowledgeRepositoryAutoSyncSchedulerPort {
  start(identityId: string): Promise<void>;
  refresh(identityId: string): Promise<void>;
  stop(options?: { commitPendingChanges?: boolean }): Promise<void>;
}

/** Keep watcher input aligned with the paths accepted by the managed Git runtime. */
export function shouldIgnoreKnowledgeRepositoryWatchPath(
  rootPath: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  if (!relativePath) return false;
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return true;

  const segments = relativePath.split(path.sep);
  if (IGNORED_TOP_LEVEL_DIRECTORIES.has(segments[0] ?? '')) return true;
  return segments.some(isTemporaryFile);
}

function selectAutomaticConnection(
  connections: KnowledgeRemoteBindingClientDTO[],
  localKnowledgeSpaceId: string,
): KnowledgeRemoteBindingClientDTO | null {
  const eligible = connections.filter((connection) =>
    Boolean(resolveReadyKnowledgeRemoteSyncState(connection, localKnowledgeSpaceId)),
  );
  if (eligible.length !== 1) {
    if (eligible.length > 1) {
      logger.warn('Automatic synchronization requires exactly one reconciled connection', {
        connectionIds: eligible.map((connection) => connection.id),
      });
    }
    return null;
  }
  return eligible[0]!;
}

export class DesktopKnowledgeRepositoryAutoSyncScheduler implements KnowledgeRepositoryAutoSyncSchedulerPort {
  private readonly watchFactory: (rootPath: string, options: ChokidarOptions) => FSWatcher;
  private readonly debounceMs: number;
  private readonly stabilityThresholdMs: number;
  private readonly shutdownCommitTimeoutMs: number;
  private identityId: string | null = null;
  private connection: KnowledgeRemoteBindingClientDTO | null = null;
  private cachedConnection: KnowledgeRemoteBindingClientDTO | null = null;
  private watchedRootPath: string | null = null;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSynchronization: Promise<void> | null = null;
  private rerunRequested = false;
  private pausedConnectionId: string | null = null;
  private stopped = true;
  private lifecycleUnsubscribers: Array<() => void> = [];

  constructor(private readonly options: DesktopKnowledgeRepositoryAutoSyncSchedulerOptions) {
    this.watchFactory = options.watchFactory ?? watch;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.stabilityThresholdMs = options.stabilityThresholdMs ?? DEFAULT_STABILITY_THRESHOLD_MS;
    this.shutdownCommitTimeoutMs =
      options.shutdownCommitTimeoutMs ?? DEFAULT_SHUTDOWN_COMMIT_TIMEOUT_MS;
  }

  async start(identityId: string): Promise<void> {
    if (!this.stopped) {
      await this.stop({ commitPendingChanges: false });
    }

    this.stopped = false;
    this.identityId = identityId;
    this.cachedConnection = await this.loadCachedConnection(identityId);
    this.subscribeToLifecycle();
    await this.refreshInternal(identityId, true);
    void this.requestSynchronization('profile-activation');
  }

  async refresh(identityId: string): Promise<void> {
    if (this.stopped) return;
    await this.refreshInternal(identityId, true);
  }

  async stop(options: { commitPendingChanges?: boolean } = {}): Promise<void> {
    if (this.stopped) return;

    this.stopped = true;
    this.clearDebounceTimer();
    this.rerunRequested = false;
    for (const unsubscribe of this.lifecycleUnsubscribers.splice(0)) {
      unsubscribe();
    }
    await this.closeWatcher();

    const identityId = this.identityId;
    const connection = this.connection;
    const activeSynchronization = this.activeSynchronization;
    const activeCompleted = activeSynchronization
      ? await this.settleWithin(activeSynchronization, this.shutdownCommitTimeoutMs)
      : true;

    if (options.commitPendingChanges && activeCompleted && identityId && connection) {
      const commit = this.options.synchronization.commitLocalChanges(identityId, connection);
      const committed = await this.settleWithin(commit, this.shutdownCommitTimeoutMs);
      if (!committed) {
        logger.warn('Timed out while creating the shutdown knowledge repository commit', {
          connectionId: connection.id,
        });
      } else {
        try {
          const result = await commit;
          if (!result.ok) {
            logger.warn('Shutdown knowledge repository commit was not created', {
              connectionId: connection.id,
              code: result.error.code,
            });
          }
        } catch (error) {
          logger.warn('Shutdown knowledge repository commit failed unexpectedly', {
            connectionId: connection.id,
            error,
          });
        }
      }
    }

    this.identityId = null;
    this.connection = null;
    this.cachedConnection = null;
    this.pausedConnectionId = null;
    this.activeSynchronization = null;
  }

  private subscribeToLifecycle(): void {
    if (!this.options.lifecycle) return;
    this.lifecycleUnsubscribers.push(
      this.options.lifecycle.onNetworkOnline(() => {
        void this.handleLifecycleTrigger('network-recovery');
      }),
      this.options.lifecycle.onSystemResume(() => {
        void this.handleLifecycleTrigger('system-resume');
      }),
    );
  }

  private async handleLifecycleTrigger(reason: string): Promise<void> {
    const identityId = this.identityId;
    if (this.stopped || !identityId) return;
    try {
      await this.refreshInternal(identityId, false);
      await this.requestSynchronization(reason);
    } catch (error) {
      logger.warn('Knowledge repository lifecycle synchronization trigger failed', {
        reason,
        error,
      });
    }
  }

  private async refreshInternal(identityId: string, clearPause: boolean): Promise<void> {
    if (this.stopped || identityId !== this.identityId) return;

    const binding = await this.options.localVault.getBinding();
    if (!binding || binding.health.state !== 'Available') {
      this.connection = null;
      this.pausedConnectionId = null;
      await this.closeWatcher();
      return;
    }

    const connections = await this.options.remote.listKnowledgeRepositoryConnections();
    let connection: KnowledgeRemoteBindingClientDTO | null;
    if (connections.ok) {
      connection = selectAutomaticConnection(
        connections.data.connections,
        binding.binding.knowledgeSpaceId,
      );
      this.cachedConnection = connection;
      await this.persistCachedConnection(connection);
    } else {
      logger.warn('Unable to refresh automatic knowledge repository synchronization', {
        code: connections.error.code,
      });
      connection =
        this.cachedConnection &&
        resolveReadyKnowledgeRemoteSyncState(
          this.cachedConnection,
          binding.binding.knowledgeSpaceId,
        )
          ? this.cachedConnection
          : null;
    }

    if (!connection) {
      this.connection = null;
      this.pausedConnectionId = null;
      await this.closeWatcher();
      return;
    }

    if (clearPause || this.pausedConnectionId !== connection.id) {
      this.pausedConnectionId = null;
    }
    this.connection = connection;
    await this.ensureWatcher(binding.binding.rootPath);
  }

  private async ensureWatcher(rootPath: string): Promise<void> {
    if (this.watcher && this.watchedRootPath === rootPath) return;
    await this.closeWatcher();

    const watcher = this.watchFactory(rootPath, {
      ignoreInitial: true,
      persistent: true,
      ignored: (candidatePath) => shouldIgnoreKnowledgeRepositoryWatchPath(rootPath, candidatePath),
      awaitWriteFinish: {
        stabilityThreshold: this.stabilityThresholdMs,
        pollInterval: Math.min(250, Math.max(50, Math.floor(this.stabilityThresholdMs / 10))),
      },
    });
    watcher.on('all', (eventName) => {
      if (SYNC_RELEVANT_EVENTS.has(eventName)) this.scheduleFileSynchronization();
    });
    watcher.on('error', (error) => {
      logger.warn('Knowledge repository watcher failed', { error });
    });
    this.watcher = watcher;
    this.watchedRootPath = rootPath;
  }

  private scheduleFileSynchronization(): void {
    if (this.stopped || !this.connection || this.pausedConnectionId === this.connection.id) return;
    this.clearDebounceTimer();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.requestSynchronization('stable-file-change');
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  private async requestSynchronization(reason: string): Promise<void> {
    if (
      this.stopped ||
      !this.identityId ||
      !this.connection ||
      this.pausedConnectionId === this.connection.id
    ) {
      return;
    }
    if (this.activeSynchronization) {
      this.rerunRequested = true;
      return await this.activeSynchronization;
    }

    const run = (async () => {
      let currentReason = reason;
      do {
        this.rerunRequested = false;
        await this.synchronizeOnce(currentReason);
        currentReason = 'coalesced-change';
      } while (
        this.rerunRequested &&
        !this.stopped &&
        this.connection &&
        this.pausedConnectionId !== this.connection.id
      );
    })();
    this.activeSynchronization = run;
    try {
      await run;
    } finally {
      if (this.activeSynchronization === run) this.activeSynchronization = null;
    }
  }

  private async synchronizeOnce(reason: string): Promise<void> {
    const identityId = this.identityId;
    const connection = this.connection;
    if (!identityId || !connection) return;

    try {
      const result = await this.options.synchronization.executeAutomatic(identityId, connection);
      if (!result.ok) {
        this.handleSynchronizationFailure(connection.id, reason, result.error);
        if (typeof result.error.context?.['remoteRepositoryBlockReason'] === 'string') {
          await this.refreshInternal(identityId, false);
        }
        return;
      }
      this.connection = result.data.connection;
      this.cachedConnection = result.data.connection;
      await this.persistCachedConnection(result.data.connection);
      logger.info('Automatic knowledge repository synchronization completed', {
        connectionId: connection.id,
        reason,
        outcome: result.data.outcome,
        headSha: result.data.headSha,
      });
    } catch (error) {
      logger.error('Automatic knowledge repository synchronization failed unexpectedly', {
        connectionId: connection.id,
        reason,
        error,
      });
    }
  }

  private handleSynchronizationFailure(
    connectionId: string,
    reason: string,
    error: { code: string; context?: Record<string, unknown> },
  ): void {
    if (error.code === 'CONFLICT' && typeof error.context?.['rebaseInProgress'] === 'boolean') {
      this.pausedConnectionId = connectionId;
    }
    logger.warn('Automatic knowledge repository synchronization did not complete', {
      connectionId,
      reason,
      code: error.code,
    });
  }

  private clearDebounceTimer(): void {
    if (!this.debounceTimer) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private async closeWatcher(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = null;
    this.watchedRootPath = null;
    if (!watcher) return;
    try {
      await watcher.close();
    } catch (error) {
      logger.warn('Failed to close knowledge repository watcher', { error });
    }
  }

  private async settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const completed = await Promise.race([
      promise.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
        timeout.unref?.();
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    return completed;
  }

  private async loadCachedConnection(
    identityId: string,
  ): Promise<KnowledgeRemoteBindingClientDTO | null> {
    const stateFilePath = this.options.stateFilePath;
    if (!stateFilePath) return null;
    try {
      const stat = await fs.promises.lstat(stateFilePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        logger.warn('Knowledge repository automatic sync state file is unsafe');
        return null;
      }
      const parsed = JSON.parse(await fs.promises.readFile(stateFilePath, 'utf8')) as {
        schemaVersion?: unknown;
        connection?: unknown;
      };
      if (parsed.schemaVersion !== 2 || parsed.connection === null) return null;
      const connection = KnowledgeRemoteBindingClientSchema.safeParse(parsed.connection);
      if (!connection.success || String(connection.data.identityId) !== identityId) {
        logger.warn('Knowledge repository automatic sync state file is invalid');
        return null;
      }
      return connection.data;
    } catch (error) {
      if (!isMissing(error)) {
        logger.warn('Unable to read knowledge repository automatic sync state', { error });
      }
      return null;
    }
  }

  private async persistCachedConnection(
    connection: KnowledgeRemoteBindingClientDTO | null,
  ): Promise<void> {
    const stateFilePath = this.options.stateFilePath;
    if (!stateFilePath) return;
    const temporaryPath = `${stateFilePath}.${process.pid}.${randomUUID()}.tmp`;
    const state: StoredKnowledgeRepositoryAutoSyncState = { schemaVersion: 2, connection };
    try {
      await fs.promises.mkdir(path.dirname(stateFilePath), { recursive: true });
      await fs.promises.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.promises.rename(temporaryPath, stateFilePath);
    } catch (error) {
      logger.warn('Unable to persist knowledge repository automatic sync state', { error });
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
