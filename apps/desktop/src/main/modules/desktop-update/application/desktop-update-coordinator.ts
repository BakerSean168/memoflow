import { createLogger } from '@memoflow/utils/logger';
import {
  DesktopUpdateSnapshotSchema,
  type DesktopInstallationOwnerDTO,
  type DesktopUpdateCapabilitiesDTO,
  type DesktopUpdateChannelDTO,
  type DesktopUpdateDisableReasonDTO,
  type DesktopUpdateFailureDTO,
  type DesktopUpdateFeedClassDTO,
  type DesktopUpdateIntentDTO,
  type DesktopUpdateOperationDTO,
  type DesktopUpdateOutcomeDTO,
  type DesktopUpdateSnapshotDTO,
  type DesktopUpdateStateDTO,
} from '@memoflow/contracts/electron';
import {
  completeDesktopUpdateCheckWithRelease,
  completeDesktopUpdateCheckWithoutRelease,
  completeDesktopUpdateDownload,
  createUninitializedDesktopUpdateState,
  disableDesktopUpdate,
  failDesktopUpdate,
  initializeDesktopUpdateState,
  markDesktopUpdateReady,
  recoverDesktopUpdateFailure,
  requestDesktopUpdateRestart,
  reportDesktopUpdateDownloadProgress,
  startDesktopUpdateCheck,
  startDesktopUpdateDownload,
  startDesktopUpdatePreparation,
} from '../domain/desktop-update-state';
import {
  DesktopUpdateEngineError,
  type DesktopUpdateEngine,
  type DesktopUpdateEngineEvent,
  type DesktopUpdateFeed,
} from './desktop-update-engine';

const logger = createLogger('DesktopUpdateCoordinator');

export type DesktopUpdateMode = 'disabled' | 'manual' | 'on-start' | 'periodic';

export interface DesktopUpdatePolicy {
  readonly mode: DesktopUpdateMode;
  readonly startupDelayMs: number;
  readonly intervalMs: number;
  readonly autoDownload: boolean;
}

export const DEFAULT_DESKTOP_UPDATE_POLICY: DesktopUpdatePolicy = Object.freeze({
  mode: 'periodic',
  startupDelayMs: 30_000,
  intervalMs: 60 * 60 * 1000,
  autoDownload: true,
});

export interface DesktopUpdateCoordinatorOptions {
  readonly engine: DesktopUpdateEngine;
  readonly currentVersion: string;
  readonly channel?: DesktopUpdateChannelDTO;
  readonly owner: DesktopInstallationOwnerDTO;
  readonly capabilities: DesktopUpdateCapabilitiesDTO;
  readonly disabledReason?: DesktopUpdateDisableReasonDTO;
  readonly feed?: DesktopUpdateFeed;
  readonly policy?: Partial<DesktopUpdatePolicy>;
  readonly now?: () => Date;
}

export interface DesktopUpdateDiagnosticsObservation {
  readonly feedClass: DesktopUpdateFeedClassDTO;
  readonly lastCheckedAt: string | null;
  readonly lastCheckResult: DesktopUpdateOutcomeDTO | null;
}

type UpdateListener = (snapshot: DesktopUpdateSnapshotDTO) => void;

function normalizeFailure(error: unknown): DesktopUpdateFailureDTO {
  if (error instanceof DesktopUpdateEngineError) return error.failure;
  return {
    code: 'unknown',
    message: 'The update operation failed.',
    retryable: true,
  };
}

function operationForState(state: DesktopUpdateStateDTO): DesktopUpdateOperationDTO | null {
  switch (state.type) {
    case 'checking':
      return 'check';
    case 'available':
    case 'downloading':
      return 'download';
    case 'downloaded':
    case 'preparing':
      return 'prepare';
    case 'ready':
    case 'restarting':
      return 'install';
    default:
      return null;
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref(): void }).unref();
  }
}

/**
 * Shell-owned application coordinator for Desktop Update (ADR-114 / DU-1105).
 *
 * This class owns scheduling, single-flight, product policy, and the canonical
 * renderer snapshot. It has no Electron or electron-updater dependency.
 */
export class DesktopUpdateCoordinator {
  private readonly engine: DesktopUpdateEngine;
  private readonly currentVersion: string;
  private readonly channel: DesktopUpdateChannelDTO;
  private readonly owner: DesktopInstallationOwnerDTO;
  private readonly capabilities: DesktopUpdateCapabilitiesDTO;
  private readonly disabledReason?: DesktopUpdateDisableReasonDTO;
  private readonly feed?: DesktopUpdateFeed;
  private readonly policy: DesktopUpdatePolicy;
  private readonly now: () => Date;
  private readonly listeners = new Set<UpdateListener>();

  private state: DesktopUpdateStateDTO = createUninitializedDesktopUpdateState();
  private lastCheckedAt: string | null = null;
  private lastCheckResult: DesktopUpdateOutcomeDTO | null = null;
  private initialized = false;
  private destroyed = false;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private engineUnsubscribe: (() => void) | null = null;
  private checkPromise: Promise<DesktopUpdateSnapshotDTO> | null = null;
  private downloadPromise: Promise<DesktopUpdateSnapshotDTO> | null = null;

  constructor(options: DesktopUpdateCoordinatorOptions) {
    this.engine = options.engine;
    this.currentVersion = options.currentVersion;
    this.channel = options.channel ?? 'stable';
    this.owner = options.owner;
    this.capabilities = options.capabilities;
    this.disabledReason = options.disabledReason;
    this.feed = options.feed;
    this.now = options.now ?? (() => new Date());
    this.policy = Object.freeze({
      ...DEFAULT_DESKTOP_UPDATE_POLICY,
      ...options.policy,
    });

    if (this.policy.startupDelayMs < 0) {
      throw new Error('Desktop Update startupDelayMs must be non-negative');
    }
    if (this.policy.intervalMs <= 0) {
      throw new Error('Desktop Update intervalMs must be positive');
    }
  }

  async initialize(): Promise<DesktopUpdateSnapshotDTO> {
    this.assertAlive();
    if (this.initialized) return this.getSnapshot();

    this.initialized = true;

    const disabledReason = this.resolveDisabledReason();
    if (disabledReason) {
      this.state = disableDesktopUpdate(this.state, disabledReason);
      this.emit();
      return this.getSnapshot();
    }

    try {
      await this.engine.initialize({
        channel: this.channel,
        ...(this.feed ? { feed: this.feed } : {}),
      });
    } catch (error) {
      logger.error('Desktop Update engine initialization failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      this.state = disableDesktopUpdate(this.state, 'invalid-configuration');
      this.emit();
      return this.getSnapshot();
    }

    this.engineUnsubscribe = this.engine.subscribe((event) => this.handleEngineEvent(event));
    this.state = initializeDesktopUpdateState(this.state, this.currentVersion);
    this.emit();
    this.scheduleBackgroundChecks();
    return this.getSnapshot();
  }

  getSnapshot(): DesktopUpdateSnapshotDTO {
    return DesktopUpdateSnapshotSchema.parse({
      state: this.state,
      currentVersion: this.currentVersion,
      channel: this.channel,
      owner: this.owner,
      capabilities: this.capabilities,
    });
  }

  getDiagnosticsObservation(): Readonly<DesktopUpdateDiagnosticsObservation> {
    return Object.freeze({
      feedClass: this.feed?.provider ?? 'none',
      lastCheckedAt: this.lastCheckedAt,
      lastCheckResult: this.lastCheckResult,
    });
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  check(intent: DesktopUpdateIntentDTO = 'explicit'): Promise<DesktopUpdateSnapshotDTO> {
    this.assertReady();

    if (this.checkPromise) return this.checkPromise;
    if (this.state.type === 'disabled') return Promise.resolve(this.getSnapshot());

    if (
      this.state.type === 'failed' &&
      this.state.failure.retryable &&
      this.state.recoverableTo === 'available'
    ) {
      this.checkPromise = this.retryDownloadAndPrepare(intent).finally(() => {
        this.checkPromise = null;
      });
      return this.checkPromise;
    }

    if (this.state.type === 'failed' && this.state.recoverableTo === 'idle') {
      this.state = recoverDesktopUpdateFailure(this.state, {
        currentVersion: this.currentVersion,
        recoveredAt: this.nowIso(),
        intent,
      });
      this.emit();
    }

    if (this.state.type !== 'idle') return Promise.resolve(this.getSnapshot());

    this.checkPromise = this.performCheck(intent).finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  /**
   * Acquire the update-install state transition before destructive shutdown.
   * The terminal installer handoff remains owned by UpdateInstallCoordinator.
   */
  beginRestartAndInstall(): DesktopUpdateSnapshotDTO {
    this.assertReady();

    if (this.state.type === 'failed' && this.state.recoverableTo === 'ready') {
      this.state = recoverDesktopUpdateFailure(this.state, {
        currentVersion: this.currentVersion,
        recoveredAt: this.nowIso(),
        intent: 'explicit',
      });
      this.emit();
    }

    this.state = requestDesktopUpdateRestart(this.state);
    this.emit();
    return this.getSnapshot();
  }

  /** Execute the platform installer handoff only from canonical restarting state. */
  handoffInstall(): void {
    this.assertReady();
    if (this.state.type !== 'restarting') {
      throw new Error(`Desktop Update cannot hand off install from '${this.state.type}'`);
    }
    this.engine.quitAndInstall();
  }

  /** Project a bounded install failure after restart/shutdown coordination began. */
  failInstall(failure: DesktopUpdateFailureDTO): DesktopUpdateSnapshotDTO {
    this.assertReady();
    if (this.state.type !== 'restarting') return this.getSnapshot();
    this.state = failDesktopUpdate(this.state, 'install', failure);
    this.emit();
    return this.getSnapshot();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    this.engineUnsubscribe?.();
    this.engineUnsubscribe = null;
    this.engine.destroy();
    this.listeners.clear();
  }

  private async performCheck(intent: DesktopUpdateIntentDTO): Promise<DesktopUpdateSnapshotDTO> {
    this.state = startDesktopUpdateCheck(this.state, intent, this.nowIso());
    this.emit();

    try {
      const result = await this.engine.check();
      if (this.destroyed) return this.getSnapshot();
      // A native/asynchronous engine error can settle the same operation before
      // the Promise resolves. Preserve that terminal projection instead of
      // attempting a second transition from `failed`.
      if (this.state.type !== 'checking') return this.getSnapshot();

      if (result.kind === 'up-to-date') {
        const checkedAt = this.recordCheckOutcome('up-to-date');
        this.state = completeDesktopUpdateCheckWithoutRelease(
          this.state,
          this.currentVersion,
          checkedAt,
        );
        this.emit();
        return this.getSnapshot();
      }

      const autoDownloadEligible =
        this.policy.autoDownload &&
        this.capabilities.canDownload &&
        this.capabilities.canAutoDownload &&
        this.owner === 'memoflow-direct';

      this.recordCheckOutcome('update-available');
      this.state = completeDesktopUpdateCheckWithRelease(
        this.state,
        result.release,
        autoDownloadEligible,
      );
      this.emit();

      if (autoDownloadEligible) {
        void this.ensureDownload().catch((error: unknown) => {
          logger.error('Unexpected Desktop Update download coordinator failure', undefined, {
            errorName: error instanceof Error ? error.name : typeof error,
          });
        });
      }

      return this.getSnapshot();
    } catch (error) {
      if (this.destroyed) return this.getSnapshot();
      this.failCurrentOperation(error);
      return this.getSnapshot();
    }
  }

  private async retryDownloadAndPrepare(
    intent: DesktopUpdateIntentDTO,
  ): Promise<DesktopUpdateSnapshotDTO> {
    // Native errors can project failed before the old download/prepare promise
    // settles. Drain that flight before recovery so late work cannot advance
    // the recovered state or overlap a new download. checkPromise owns retries.
    await this.downloadPromise;
    if (this.destroyed) return this.getSnapshot();
    const state = this.readState();
    if (
      state.type !== 'failed' ||
      !state.failure.retryable ||
      state.recoverableTo !== 'available'
    ) {
      return this.getSnapshot();
    }

    this.state = recoverDesktopUpdateFailure(state, {
      currentVersion: this.currentVersion,
      recoveredAt: this.nowIso(),
      intent,
    });
    this.emit();
    return this.ensureDownload();
  }

  private ensureDownload(): Promise<DesktopUpdateSnapshotDTO> {
    if (this.downloadPromise) return this.downloadPromise;
    if (this.state.type !== 'available') return Promise.resolve(this.getSnapshot());

    this.downloadPromise = this.performDownloadAndPrepare().finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  private async performDownloadAndPrepare(): Promise<DesktopUpdateSnapshotDTO> {
    this.state = startDesktopUpdateDownload(this.state);
    this.emit();

    try {
      await this.engine.download();
      if (this.destroyed) return this.getSnapshot();

      // A native downloaded/error event may already have projected a new state
      // while the Promise was pending. Re-read through a method so TypeScript
      // does not incorrectly preserve a pre-await property narrowing.
      let stateAfterDownload = this.readState();
      if (stateAfterDownload.type === 'downloading') {
        this.state = completeDesktopUpdateDownload(stateAfterDownload);
        this.emit();
        stateAfterDownload = this.readState();
      }
      if (stateAfterDownload.type === 'failed') return this.getSnapshot();
      if (stateAfterDownload.type !== 'downloaded') return this.getSnapshot();

      this.state = startDesktopUpdatePreparation(stateAfterDownload);
      this.emit();

      await this.engine.prepare();
      if (this.destroyed) return this.getSnapshot();
      const stateAfterPrepare = this.readState();
      if (stateAfterPrepare.type === 'failed') return this.getSnapshot();
      if (stateAfterPrepare.type !== 'preparing') return this.getSnapshot();

      this.state = markDesktopUpdateReady(stateAfterPrepare);
      this.emit();
      return this.getSnapshot();
    } catch (error) {
      if (this.destroyed) return this.getSnapshot();
      this.failCurrentOperation(error);
      return this.getSnapshot();
    }
  }

  private handleEngineEvent(event: DesktopUpdateEngineEvent): void {
    if (this.destroyed) return;

    if (event.type === 'download-progress') {
      if (this.state.type !== 'downloading') return;
      this.state = reportDesktopUpdateDownloadProgress(this.state, event.progress);
      this.emit();
      return;
    }

    if (event.type === 'downloaded') {
      if (this.state.type !== 'downloading') return;
      this.state = completeDesktopUpdateDownload(this.state);
      this.emit();
      return;
    }

    const operation = operationForState(this.state);
    if (!operation) return;
    this.failCurrentOperation(new DesktopUpdateEngineError(event.failure));
  }

  private failCurrentOperation(error: unknown): void {
    const operation = operationForState(this.state);
    if (!operation) return;

    // The canonical state owns operation identity; stale async work must not
    // overwrite the operation classification of a newer state.
    if (operation === 'check') this.recordCheckOutcome('failed');
    this.state = failDesktopUpdate(this.state, operation, normalizeFailure(error));
    this.emit();
  }

  private recordCheckOutcome(result: DesktopUpdateOutcomeDTO): string {
    const checkedAt = this.nowIso();
    this.lastCheckedAt = checkedAt;
    this.lastCheckResult = result;
    return checkedAt;
  }

  private scheduleBackgroundChecks(): void {
    if (!this.capabilities.canBackgroundCheck) return;
    if (this.policy.mode !== 'on-start' && this.policy.mode !== 'periodic') return;

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.check('background');
    }, this.policy.startupDelayMs);
    unrefTimer(this.startupTimer);

    if (this.policy.mode === 'periodic') {
      this.periodicTimer = setInterval(() => {
        void this.check('background');
      }, this.policy.intervalMs);
      unrefTimer(this.periodicTimer);
    }
  }

  private resolveDisabledReason(): DesktopUpdateDisableReasonDTO | null {
    if (this.policy.mode === 'disabled') return 'updates-disabled';
    if (this.disabledReason) return this.disabledReason;
    if (this.capabilities.canCheck) return null;
    if (this.owner === 'system-store' || this.owner === 'enterprise-managed') {
      return 'managed-externally';
    }
    return 'unsupported-installation';
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private readState(): DesktopUpdateStateDTO {
    return this.state;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Desktop Update coordinator has been destroyed');
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.initialized) throw new Error('Desktop Update coordinator is not initialized');
  }
}
