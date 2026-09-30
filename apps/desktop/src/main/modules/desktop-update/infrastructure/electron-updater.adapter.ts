import { createLogger } from '@memoflow/utils/logger';
import type {
  DesktopUpdateChannelDTO,
  DesktopUpdateFailureCodeDTO,
  DesktopUpdateFailureDTO,
  DesktopUpdateProgressDTO,
  DesktopUpdateReleaseDTO,
} from '@memoflow/contracts/electron';
import type { AppUpdater, ProgressInfo, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import {
  DesktopUpdateEngineError,
  type DesktopUpdateEngine,
  type DesktopUpdateEngineCheckResult,
  type DesktopUpdateEngineEvent,
  type DesktopUpdateEngineInitOptions,
} from '../application/desktop-update-engine';

const logger = createLogger('ElectronUpdaterAdapter');

type UpdaterLoader = () => Promise<{ autoUpdater: AppUpdater }>;
type ActiveOperation = 'check' | 'download' | 'prepare' | 'install' | null;

export interface ElectronUpdaterAdapterOptions {
  readonly loadUpdater?: UpdaterLoader;
}

function failureMessage(code: DesktopUpdateFailureCodeDTO): string {
  switch (code) {
    case 'signature-invalid':
      return 'The downloaded update failed signature verification.';
    case 'checksum-mismatch':
      return 'The downloaded update failed integrity verification.';
    case 'invalid-metadata':
      return 'The update metadata is invalid.';
    case 'download-failed':
      return 'Unable to download the update.';
    case 'prepare-failed':
      return 'Unable to prepare the update for installation.';
    case 'install-handoff-failed':
      return 'Unable to hand off the update to the installer.';
    case 'feed-unavailable':
      return 'Unable to check the update feed.';
    default:
      return 'The update operation failed.';
  }
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function safeErrorMetadata(error: unknown): { errorName: string; updaterErrorCode: string | null } {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    updaterErrorCode: errorCode(error),
  };
}

function mapFailureCode(
  error: unknown,
  operation: Exclude<ActiveOperation, null>,
): DesktopUpdateFailureCodeDTO {
  const code = errorCode(error);
  if (code === 'ERR_UPDATER_INVALID_SIGNATURE') return 'signature-invalid';
  if (code === 'ERR_CHECKSUM_MISMATCH') return 'checksum-mismatch';
  if (
    code === 'ERR_UPDATER_INVALID_VERSION' ||
    code === 'ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION' ||
    code === 'ERR_UPDATER_UNSUPPORTED_PROVIDER'
  ) {
    return 'invalid-metadata';
  }

  if (operation === 'check') return 'feed-unavailable';
  if (operation === 'download') return 'download-failed';
  if (operation === 'prepare') return 'prepare-failed';
  return 'install-handoff-failed';
}

function normalizeFailure(
  error: unknown,
  operation: Exclude<ActiveOperation, null>,
): DesktopUpdateFailureDTO {
  const code = mapFailureCode(error, operation);
  return {
    code,
    message: failureMessage(code),
    retryable: !['signature-invalid', 'checksum-mismatch', 'invalid-metadata'].includes(code),
  };
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string | null {
  if (typeof releaseNotes === 'string') return releaseNotes;
  if (!Array.isArray(releaseNotes)) return null;

  const notes = releaseNotes
    .map((entry) => entry.note)
    .filter((note): note is string => typeof note === 'string' && note.length > 0);
  return notes.length > 0 ? notes.join('\n\n') : null;
}

function normalizeRelease(
  info: ElectronUpdateInfo,
  channel: DesktopUpdateChannelDTO,
): DesktopUpdateReleaseDTO {
  return {
    version: info.version,
    channel,
    publishedAt: normalizeDate(info.releaseDate),
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseNotesUrl: null,
  };
}

function normalizeProgress(info: ProgressInfo): DesktopUpdateProgressDTO {
  return {
    percent: Math.min(100, Math.max(0, info.percent)),
    transferredBytes: Math.max(0, info.transferred),
    totalBytes: Math.max(0, info.total),
    bytesPerSecond: Math.max(0, info.bytesPerSecond),
  };
}

/**
 * electron-updater v6 infrastructure adapter.
 *
 * Product policy remains outside the SDK:
 * - autoDownload is always false;
 * - autoInstallOnAppQuit is always false;
 * - automatic downgrade is disabled;
 * - renderer never sees native events, paths, or provider errors.
 */
export class ElectronUpdaterAdapter implements DesktopUpdateEngine {
  private readonly loadUpdater: UpdaterLoader;
  private readonly listeners = new Set<(event: DesktopUpdateEngineEvent) => void>();
  private updater: AppUpdater | null = null;
  private channel: DesktopUpdateChannelDTO = 'stable';
  private activeOperation: ActiveOperation = null;
  private downloadedRelease: DesktopUpdateReleaseDTO | null = null;
  private handoffRequested = false;

  private readonly onDownloadProgress = (info: ProgressInfo): void => {
    this.emit({
      type: 'download-progress',
      progress: normalizeProgress(info),
    });
  };

  private readonly onUpdateDownloaded = (info: ElectronUpdateInfo): void => {
    const release = normalizeRelease(info, this.channel);
    this.downloadedRelease = release;
    this.emit({ type: 'downloaded', release });
  };

  private readonly onUpdaterError = (error: Error): void => {
    // Promise-backed check/download operations report their normalized failure
    // through rejection; suppress the duplicate native event in that window.
    if (this.activeOperation && this.activeOperation !== 'install') return;

    const operation: Exclude<ActiveOperation, null> = this.handoffRequested ? 'install' : 'check';
    const failure = normalizeFailure(error, operation);
    logger.error('electron-updater emitted an asynchronous error', undefined, {
      ...safeErrorMetadata(error),
      failureCode: failure.code,
      operation,
    });
    this.emit({ type: 'engine-error', failure });
  };

  constructor(options: ElectronUpdaterAdapterOptions = {}) {
    this.loadUpdater = options.loadUpdater ?? (() => import('electron-updater'));
  }

  async initialize(options: DesktopUpdateEngineInitOptions): Promise<void> {
    if (this.updater) return;

    const { autoUpdater } = await this.loadUpdater();
    this.updater = autoUpdater;
    this.channel = options.channel;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = options.channel !== 'stable';
    autoUpdater.disableWebInstaller = true;

    if (options.feed) {
      if (options.feed.provider === 'github') {
        autoUpdater.setFeedURL({
          provider: 'github',
          owner: options.feed.owner,
          repo: options.feed.repo,
          channel: options.feed.channel,
          ...(options.feed.tagNamePrefix ? { tagNamePrefix: options.feed.tagNamePrefix } : {}),
        });
      } else {
        autoUpdater.setFeedURL({
          provider: 'generic',
          url: options.feed.url,
          channel: options.feed.channel,
        });
      }
    }

    autoUpdater.on('download-progress', this.onDownloadProgress);
    autoUpdater.on('update-downloaded', this.onUpdateDownloaded);
    autoUpdater.on('error', this.onUpdaterError);
  }

  async check(): Promise<DesktopUpdateEngineCheckResult> {
    const updater = this.requireUpdater();
    return this.withOperation('check', async () => {
      try {
        const result = await updater.checkForUpdates();
        if (!result) {
          throw new DesktopUpdateEngineError({
            code: 'feed-unavailable',
            message: failureMessage('feed-unavailable'),
            retryable: true,
          });
        }

        if (!result.isUpdateAvailable) {
          return { kind: 'up-to-date' } as const;
        }

        return {
          kind: 'available',
          release: normalizeRelease(result.updateInfo, this.channel),
        } as const;
      } catch (error) {
        if (error instanceof DesktopUpdateEngineError) throw error;
        logger.error('Failed to check for Desktop update', undefined, safeErrorMetadata(error));
        throw new DesktopUpdateEngineError(normalizeFailure(error, 'check'));
      }
    });
  }

  async download(): Promise<void> {
    const updater = this.requireUpdater();
    await this.withOperation('download', async () => {
      try {
        await updater.downloadUpdate();
      } catch (error) {
        logger.error('Failed to download Desktop update', undefined, safeErrorMetadata(error));
        throw new DesktopUpdateEngineError(normalizeFailure(error, 'download'));
      }
    });
  }

  async prepare(): Promise<void> {
    await this.withOperation('prepare', async () => {
      // electron-updater v6 emits update-downloaded only after the artifact has
      // been persisted/staged. Keep an explicit application step so a future
      // engine can perform additional platform preparation without changing the
      // coordinator or renderer state machine.
      if (!this.downloadedRelease) {
        throw new DesktopUpdateEngineError({
          code: 'prepare-failed',
          message: failureMessage('prepare-failed'),
          retryable: true,
        });
      }
    });
  }

  quitAndInstall(): void {
    const updater = this.requireUpdater();
    if (!this.downloadedRelease) {
      throw new DesktopUpdateEngineError({
        code: 'install-handoff-failed',
        message: failureMessage('install-handoff-failed'),
        retryable: true,
      });
    }

    this.activeOperation = 'install';
    this.handoffRequested = true;
    try {
      // "Restart to update" is an application-owned seamless handoff, not a
      // request to reopen the assisted NSIS wizard. electron-updater v6 defaults
      // to a non-silent installer; with oneClick:false that can strand the
      // detached installer waiting for UI after MemoFlow has already exited.
      // Silent + force-run gives Windows the intended atomic user experience:
      // replace the per-user install, then relaunch the updated application.
      updater.quitAndInstall(true, true);
    } catch (error) {
      this.activeOperation = null;
      this.handoffRequested = false;
      logger.error(
        'Failed to hand off Desktop update to installer',
        undefined,
        safeErrorMetadata(error),
      );
      throw new DesktopUpdateEngineError(normalizeFailure(error, 'install'));
    }
  }

  subscribe(listener: (event: DesktopUpdateEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.updater) {
      this.updater.removeListener('download-progress', this.onDownloadProgress);
      this.updater.removeListener('update-downloaded', this.onUpdateDownloaded);
      this.updater.removeListener('error', this.onUpdaterError);
    }

    this.listeners.clear();
    this.updater = null;
    this.activeOperation = null;
    this.downloadedRelease = null;
    this.handoffRequested = false;
  }

  private requireUpdater(): AppUpdater {
    if (!this.updater) {
      throw new DesktopUpdateEngineError({
        code: 'feed-unavailable',
        message: 'The update engine is not initialized.',
        retryable: false,
      });
    }
    return this.updater;
  }

  private emit(event: DesktopUpdateEngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async withOperation<T>(
    operation: Exclude<ActiveOperation, null>,
    work: () => Promise<T>,
  ): Promise<T> {
    this.activeOperation = operation;
    try {
      return await work();
    } finally {
      if (this.activeOperation === operation && operation !== 'install') {
        this.activeOperation = null;
      }
    }
  }
}
