import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdater, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { DesktopUpdateEngineError } from '../application/desktop-update-engine';
import { ElectronUpdaterAdapter } from './electron-updater.adapter';

const updateInfo: ElectronUpdateInfo = {
  version: '1.2.3',
  files: [
    {
      url: 'MemoFlow-Windows-1.2.3-Setup.exe',
      sha512: 'fixture',
    },
  ],
  path: 'MemoFlow-Windows-1.2.3-Setup.exe',
  sha512: 'fixture',
  releaseDate: '2026-09-30T00:00:00.000Z',
  releaseNotes: 'Release notes',
};

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
  disableWebInstaller = false;

  checkResult: Awaited<ReturnType<AppUpdater['checkForUpdates']>> = {
    isUpdateAvailable: true,
    updateInfo,
    versionInfo: updateInfo,
  };

  readonly setFeedURL = vi.fn();
  readonly checkForUpdates = vi.fn(async () => this.checkResult);
  readonly downloadUpdate = vi.fn(async () => {
    this.emit('download-progress', {
      percent: 37.5,
      bytesPerSecond: 20,
      total: 200,
      transferred: 75,
    });
    this.emit('update-downloaded', updateInfo);
    return ['/private/updater/MemoFlow-Windows-1.2.3-Setup.exe'];
  });
  readonly quitAndInstall = vi.fn();
}

function createHarness() {
  const updater = new FakeUpdater();
  const adapter = new ElectronUpdaterAdapter({
    loadUpdater: async () => ({ autoUpdater: updater as AppUpdater }),
  });
  return { updater, adapter };
}

describe('ElectronUpdaterAdapter', () => {
  it('owns SDK policy instead of delegating product policy to electron-updater defaults', async () => {
    const { updater, adapter } = createHarness();

    await adapter.initialize({
      channel: 'stable',
      feed: {
        provider: 'github',
        owner: 'BakerSean168',
        repo: 'memoflow',
        channel: 'latest',
        tagNamePrefix: 'v',
      },
    });

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.disableWebInstaller).toBe(true);
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'BakerSean168',
      repo: 'memoflow',
      channel: 'latest',
      tagNamePrefix: 'v',
    });
  });

  it('maps an available SDK result into provider-neutral release metadata', async () => {
    const { adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });

    await expect(adapter.check()).resolves.toEqual({
      kind: 'available',
      release: {
        version: '1.2.3',
        channel: 'stable',
        publishedAt: '2026-09-30T00:00:00.000Z',
        releaseNotes: 'Release notes',
        releaseNotesUrl: null,
      },
    });
  });

  it('maps no-update without leaking the latest provider payload', async () => {
    const { updater, adapter } = createHarness();
    updater.checkResult = {
      isUpdateAvailable: false,
      updateInfo,
      versionInfo: updateInfo,
    };
    await adapter.initialize({ channel: 'stable' });

    await expect(adapter.check()).resolves.toEqual({ kind: 'up-to-date' });
  });

  it('projects progress/download events without exposing downloaded file paths', async () => {
    const { adapter } = createHarness();
    const events: unknown[] = [];
    await adapter.initialize({ channel: 'stable' });
    await adapter.check();
    adapter.subscribe((event) => events.push(event));

    await adapter.download();
    await adapter.prepare();

    expect(events).toEqual([
      {
        type: 'download-progress',
        progress: {
          percent: 37.5,
          transferredBytes: 75,
          totalBytes: 200,
          bytesPerSecond: 20,
        },
      },
      {
        type: 'downloaded',
        release: {
          version: '1.2.3',
          channel: 'stable',
          publishedAt: '2026-09-30T00:00:00.000Z',
          releaseNotes: 'Release notes',
          releaseNotesUrl: null,
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('/private/updater/');
  });

  it('requires a completed SDK download before prepare/install', async () => {
    const { adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });

    await expect(adapter.prepare()).rejects.toMatchObject({
      failure: {
        code: 'prepare-failed',
      },
    });
    expect(() => adapter.quitAndInstall()).toThrow(DesktopUpdateEngineError);
  });

  it('hands off exactly once through the wrapped updater after download', async () => {
    const { updater, adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });
    await adapter.check();
    await adapter.download();
    await adapter.prepare();

    adapter.quitAndInstall();

    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('normalizes signature failures and never forwards the raw provider error message', async () => {
    const { updater, adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });
    updater.downloadUpdate.mockRejectedValueOnce(
      Object.assign(new Error('/tmp/private.exe signed by Mallory'), {
        code: 'ERR_UPDATER_INVALID_SIGNATURE',
      }),
    );

    const failure = await adapter.download().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DesktopUpdateEngineError);
    expect(failure).toMatchObject({
      failure: {
        code: 'signature-invalid',
        message: 'The downloaded update failed signature verification.',
        retryable: false,
      },
    });
    expect((failure as Error).message).not.toContain('/tmp/private.exe');
  });

  it('normalizes checksum failures as non-retryable integrity failures', async () => {
    const { updater, adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });
    updater.downloadUpdate.mockRejectedValueOnce(
      Object.assign(new Error('sha512 mismatch at /private/cache'), {
        code: 'ERR_CHECKSUM_MISMATCH',
      }),
    );

    await expect(adapter.download()).rejects.toMatchObject({
      failure: {
        code: 'checksum-mismatch',
        retryable: false,
      },
    });
  });

  it('removes native listeners on destroy', async () => {
    const { updater, adapter } = createHarness();
    await adapter.initialize({ channel: 'stable' });

    expect(updater.listenerCount('download-progress')).toBe(1);
    expect(updater.listenerCount('update-downloaded')).toBe(1);
    expect(updater.listenerCount('error')).toBe(1);

    adapter.destroy();

    expect(updater.listenerCount('download-progress')).toBe(0);
    expect(updater.listenerCount('update-downloaded')).toBe(0);
    expect(updater.listenerCount('error')).toBe(0);
  });
});
