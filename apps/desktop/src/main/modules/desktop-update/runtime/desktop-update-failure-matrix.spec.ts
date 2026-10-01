import { EventEmitter } from 'node:events';
import type { AppUpdater, UpdateInfo } from 'electron-updater';
import { afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { DesktopShutdownCoordinator } from '../../../lifecycle/desktop-shutdown-coordinator';
import { DesktopUpdateCoordinator } from '../application/desktop-update-coordinator';
import { DesktopUpdateEngineError } from '../application/desktop-update-engine';
import { DesktopUpdateDiagnosticsService } from '../application/desktop-update-diagnostics';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from '../application/desktop-update-install-receipt';
import { UpdateInstallCoordinator } from '../application/update-install-coordinator';
import { capabilitiesForInstallationOwner } from '../domain/installation-ownership';
import { ElectronUpdaterAdapter } from '../infrastructure/electron-updater.adapter';

const EXPECTED_SCENARIOS = [
  'offline-check',
  'malformed-metadata',
  'missing-artifact',
  'checksum-mismatch',
  'download-interrupted',
  'app-closed-during-download',
  'cleanup-failure',
  'cleanup-timeout',
  'handoff-throw',
  'renderer-recreated',
  'duplicate-check',
  'duplicate-install',
  'superseding-release',
  'os-session-end',
] as const;
const executed: string[] = [];
const disposals: Array<() => void> = [];

const updateInfo: UpdateInfo = {
  version: '1.2.3',
  files: [{ url: 'MemoFlow-Setup.exe', sha512: 'fixture' }],
  path: 'MemoFlow-Setup.exe',
  sha512: 'fixture',
  releaseDate: '2026-09-30T00:00:00.000Z',
};

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
  disableWebInstaller = false;
  readonly setFeedURL = vi.fn();
  readonly checkForUpdates = vi.fn(async () => ({
    isUpdateAvailable: true,
    updateInfo,
    versionInfo: updateInfo,
  }));
  readonly downloadUpdate = vi.fn(async () => {
    this.emit('update-downloaded', updateInfo);
    return ['/private/cache/installer.exe'];
  });
  readonly quitAndInstall = vi.fn();
}

class MemoryReceipts implements DesktopUpdateInstallReceiptStore {
  readonly writes: DesktopUpdateInstallReceipt[] = [];
  async read() {
    return this.writes.at(-1) ?? null;
  }
  async write(receipt: DesktopUpdateInstallReceipt) {
    this.writes.push({ ...receipt });
  }
  async clear() {
    this.writes.length = 0;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function providerError(code: string) {
  return Object.assign(new Error('/private/cache/installer.exe raw provider secret'), { code });
}

async function harness(autoDownload = true) {
  const updater = new FakeUpdater();
  const adapter = new ElectronUpdaterAdapter({
    loadUpdater: async () => ({ autoUpdater: updater as unknown as AppUpdater }),
  });
  const update = new DesktopUpdateCoordinator({
    engine: adapter,
    currentVersion: '1.2.2',
    owner: 'memoflow-direct',
    capabilities: capabilitiesForInstallationOwner('memoflow-direct'),
    policy: { mode: 'manual', autoDownload },
  });
  disposals.push(() => update.destroy());
  await update.initialize();
  return { updater, adapter, update };
}

async function readyHarness(cleanup: () => Promise<void> = async () => undefined) {
  const base = await harness();
  await base.update.check();
  await vi.waitFor(() => expect(base.update.getSnapshot().state.type).toBe('ready'));
  const receipts = new MemoryReceipts();
  const forceExit = vi.fn();
  const shutdown = new DesktopShutdownCoordinator({ cleanup, timeoutMs: 100 });
  const install = new UpdateInstallCoordinator({
    update: base.update,
    shutdown,
    receiptStore: receipts,
    forceExit,
    handoffWatchdogMs: 100,
  });
  disposals.push(() => install.destroy());
  return { ...base, receipts, forceExit, shutdown, install };
}

afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
  vi.useRealTimers();
});

afterAll(() => {
  expect(executed).toHaveLength(14);
  expect(new Set(executed).size).toBe(14);
  expect([...executed].sort()).toEqual([...EXPECTED_SCENARIOS].sort());
});

function scenario(id: (typeof EXPECTED_SCENARIOS)[number], run: () => Promise<void>) {
  it(id, async () => {
    await run();
    executed.push(id);
  });
}

describe('Desktop Update non-macOS failure matrix', () => {
  scenario('offline-check', async () => {
    const { update, updater } = await harness();
    updater.checkForUpdates.mockRejectedValueOnce(providerError('ENOTFOUND'));
    await expect(update.check('background')).resolves.toMatchObject({
      state: {
        type: 'failed',
        recoverableTo: 'idle',
        failure: { code: 'feed-unavailable', retryable: true },
      },
    });
    updater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: false,
      updateInfo,
      versionInfo: updateInfo,
    });
    expect((await update.check('explicit')).state.type).toBe('idle');
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  scenario('malformed-metadata', async () => {
    const { adapter, updater } = await harness();
    updater.checkForUpdates.mockRejectedValueOnce(providerError('ERR_UPDATER_INVALID_VERSION'));
    await expect(adapter.check()).rejects.toMatchObject({
      failure: { code: 'invalid-metadata', retryable: false },
    });
  });

  scenario('missing-artifact', async () => {
    const { update, adapter, updater } = await harness();
    const states: string[] = [];
    update.subscribe((snapshot) => states.push(snapshot.state.type));
    const download = vi.spyOn(adapter, 'download');
    updater.downloadUpdate.mockRejectedValueOnce(providerError('ENOENT'));
    await update.check();
    await vi.waitFor(() =>
      expect(update.getSnapshot().state).toMatchObject({
        type: 'failed',
        failure: { code: 'download-failed', retryable: true },
      }),
    );
    await expect(download.mock.results[0].value).rejects.toBeInstanceOf(DesktopUpdateEngineError);
    expect(states).not.toContain('ready');
  });

  scenario('checksum-mismatch', async () => {
    const { update, updater } = await harness();
    updater.downloadUpdate.mockRejectedValueOnce(providerError('ERR_CHECKSUM_MISMATCH'));
    await update.check();
    await vi.waitFor(() =>
      expect(update.getSnapshot().state).toMatchObject({
        type: 'failed',
        recoverableTo: 'available',
        failure: { code: 'checksum-mismatch', retryable: false },
      }),
    );
    const failed = update.getSnapshot();
    expect(await update.check()).toEqual(failed);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  scenario('download-interrupted', async () => {
    const { update, updater, adapter } = await harness();
    const prepare = vi.spyOn(adapter, 'prepare');
    updater.downloadUpdate.mockRejectedValueOnce(providerError('ECONNRESET'));
    await update.check();
    await vi.waitFor(() =>
      expect(update.getSnapshot().state).toMatchObject({
        type: 'failed',
        recoverableTo: 'available',
        failure: { retryable: true },
      }),
    );
    expect((await update.check('explicit')).state.type).toBe('ready');
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  scenario('app-closed-during-download', async () => {
    const { update, updater, adapter } = await harness();
    const download = deferred<string[]>();
    const flight = vi.spyOn(adapter, 'download');
    updater.downloadUpdate.mockReturnValueOnce(download.promise);
    const snapshots: DesktopUpdateSnapshotDTO[] = [];
    update.subscribe((snapshot) => snapshots.push(snapshot));
    await update.check();
    expect(update.getSnapshot().state.type).toBe('downloading');
    update.destroy();
    const count = snapshots.length;
    updater.emit('update-downloaded', updateInfo);
    download.resolve(['/private/cache/installer.exe']);
    await flight.mock.results[0].value;
    await Promise.resolve();
    expect(update.getSnapshot().state.type).toBe('downloading');
    expect(snapshots).toHaveLength(count);
    expect(snapshots.some((snapshot) => snapshot.state.type === 'ready')).toBe(false);
  });

  scenario('cleanup-failure', async () => {
    const { install, updater, forceExit } = await readyHarness(async () => {
      throw new Error('cleanup failed');
    });
    await expect(install.requestRestartAndInstall()).resolves.toMatchObject({
      state: { type: 'failed', failure: { code: 'shutdown-failed' } },
    });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(forceExit).toHaveBeenCalledTimes(1);
  });

  scenario('cleanup-timeout', async () => {
    const { install, updater, forceExit, shutdown } = await readyHarness(
      () => new Promise<void>(() => undefined),
    );
    vi.useFakeTimers();
    let settled = false;
    const pending = install.requestRestartAndInstall().then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      state: { type: 'failed', failure: { code: 'shutdown-failed' } },
    });
    expect(await shutdown.request('update-install')).toMatchObject({ status: 'timed-out' });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(forceExit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  scenario('handoff-throw', async () => {
    const { install, update, updater, receipts, forceExit } = await readyHarness();
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw providerError('EACCES');
    });
    await expect(install.requestRestartAndInstall()).resolves.toMatchObject({
      state: { type: 'failed', failure: { code: 'install-handoff-failed' } },
    });
    expect(forceExit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(receipts.writes.at(-1)?.stage).toBe('installer-handoff'));
    const diagnostics = await new DesktopUpdateDiagnosticsService(
      update,
      receipts,
    ).getDiagnostics();
    expect(diagnostics.installReceipt.status).toBe('installer-handoff');
    expect(diagnostics.failure?.code).toBe('install-handoff-failed');
    expect(JSON.stringify(diagnostics)).not.toMatch(
      /private|installer.exe|raw provider secret|message/,
    );
  });

  scenario('renderer-recreated', async () => {
    const { update } = await harness();
    const oldRenderer = vi.fn();
    const unsubscribe = update.subscribe(oldRenderer);
    unsubscribe();
    await update.check();
    await vi.waitFor(() => expect(update.getSnapshot().state.type).toBe('ready'));
    const replay = update.getSnapshot();
    const newRenderer = vi.fn();
    const unsubscribeNew = update.subscribe(newRenderer);
    expect(update.getSnapshot()).toEqual(replay);
    expect(replay.state).toMatchObject({ type: 'ready', release: { version: '1.2.3' } });
    expect(oldRenderer).not.toHaveBeenCalled();
    expect(newRenderer).not.toHaveBeenCalled();
    unsubscribeNew();
  });

  scenario('duplicate-check', async () => {
    const { update, updater } = await harness();
    const check = deferred<Awaited<ReturnType<typeof updater.checkForUpdates>>>();
    updater.checkForUpdates.mockReturnValueOnce(check.promise);
    const first = update.check();
    const second = update.check();
    expect(first).toBe(second);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    check.resolve({ isUpdateAvailable: false, updateInfo, versionInfo: updateInfo });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a.state.type).toBe('idle');
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  scenario('duplicate-install', async () => {
    const cleanup = deferred<void>();
    const runCleanup = vi.fn(() => cleanup.promise);
    const { install, updater, forceExit, receipts } = await readyHarness(runCleanup);
    const first = install.requestRestartAndInstall();
    const second = install.requestRestartAndInstall();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(runCleanup).toHaveBeenCalledTimes(1));
    cleanup.resolve();
    await Promise.all([first, second]);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(receipts.writes.filter((receipt) => receipt.stage === 'restart-requested')).toHaveLength(
      1,
    );
    expect(install.requestRestartAndInstall()).toBe(first);
    expect(forceExit).not.toHaveBeenCalled();
  });

  scenario('superseding-release', async () => {
    for (const autoDownload of [false, true]) {
      const { update, updater } = await harness(autoDownload);
      expect(updater.allowDowngrade).toBe(false);
      const download = deferred<string[]>();
      updater.downloadUpdate.mockReturnValueOnce(download.promise);
      await update.check();
      updater.checkForUpdates.mockResolvedValue({
        isUpdateAvailable: true,
        updateInfo: { ...updateInfo, version: '1.2.4' },
        versionInfo: { ...updateInfo, version: '1.2.4' },
      });
      const owned = await update.check();
      expect(owned.state).toMatchObject({
        type: autoDownload ? 'downloading' : 'available',
        release: { version: '1.2.3' },
      });
      if (autoDownload) {
        updater.emit('update-downloaded', updateInfo);
        download.resolve(['/private/cache/installer.exe']);
        await vi.waitFor(() => expect(update.getSnapshot().state.type).toBe('ready'));
        expect((await update.check()).state).toMatchObject({
          type: 'ready',
          release: { version: '1.2.3' },
        });
      }
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    }
  });

  scenario('os-session-end', async () => {
    const { install, updater } = await readyHarness();
    expect(updater.autoInstallOnAppQuit).toBe(false);
    const cleanup = vi.fn(async () => undefined);
    const normalQuit = new DesktopShutdownCoordinator({ cleanup });
    expect(await normalQuit.request('normal-quit')).toMatchObject({ status: 'completed' });
    normalQuit.beginTerminalExit('normal-quit');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await install.requestRestartAndInstall();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
