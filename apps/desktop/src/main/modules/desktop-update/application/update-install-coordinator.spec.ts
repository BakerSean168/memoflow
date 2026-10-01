import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopUpdateFailureDTO,
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { DesktopShutdownCoordinator } from '../../../lifecycle/desktop-shutdown-coordinator';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from './desktop-update-install-receipt';
import {
  type DesktopUpdateInstallUpdatePort,
  UpdateInstallCoordinator,
} from './update-install-coordinator';

const release: DesktopUpdateReleaseDTO = {
  version: '1.2.3',
  channel: 'stable',
  publishedAt: '2026-09-30T00:00:00.000Z',
  releaseNotes: 'Release',
  releaseNotesUrl: null,
};

const capabilities = {
  canCheck: true,
  canBackgroundCheck: true,
  canDownload: true,
  canSelfInstall: true,
  canAutoDownload: true,
  installAuthority: 'memoflow' as const,
};

class FakeUpdatePort implements DesktopUpdateInstallUpdatePort {
  snapshot: DesktopUpdateSnapshotDTO = {
    state: {
      type: 'ready',
      intent: 'explicit',
      release,
    },
    currentVersion: '1.2.2',
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities,
  };

  readonly beginRestartAndInstall = vi.fn(() => {
    this.snapshot = {
      ...this.snapshot,
      state: { type: 'restarting', release },
    };
    return this.snapshot;
  });

  readonly handoffInstall = vi.fn();

  readonly failInstall = vi.fn((failure: DesktopUpdateFailureDTO) => {
    this.snapshot = {
      ...this.snapshot,
      state: {
        type: 'failed',
        operation: 'install',
        failure,
        recoverableTo: 'ready',
        release,
      },
    };
    return this.snapshot;
  });

  getSnapshot(): DesktopUpdateSnapshotDTO {
    return this.snapshot;
  }
}

class MemoryReceiptStore implements DesktopUpdateInstallReceiptStore {
  readonly writes: DesktopUpdateInstallReceipt[] = [];
  failWrites = false;

  async read(): Promise<DesktopUpdateInstallReceipt | null> {
    return this.writes.at(-1) ?? null;
  }

  async write(receipt: DesktopUpdateInstallReceipt): Promise<void> {
    if (this.failWrites) throw new Error('/private/install-receipt.json unavailable');
    this.writes.push({ ...receipt });
  }

  async clear(): Promise<void> {
    this.writes.splice(0);
  }
}

function completedShutdown(cleanup = vi.fn(async () => undefined)) {
  return {
    shutdown: new DesktopShutdownCoordinator({ cleanup }),
    cleanup,
  };
}

describe('UpdateInstallCoordinator', () => {
  it('does nothing unless the canonical update state is ready', async () => {
    const update = new FakeUpdatePort();
    update.snapshot = {
      ...update.snapshot,
      state: {
        type: 'idle',
        currentVersion: '1.2.2',
        lastCheckedAt: null,
        lastOutcome: null,
      },
    };
    const receiptStore = new MemoryReceiptStore();
    const { shutdown, cleanup } = completedShutdown();
    const forceExit = vi.fn();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
    });

    await expect(coordinator.requestRestartAndInstall()).resolves.toEqual(update.snapshot);

    expect(update.beginRestartAndInstall).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(receiptStore.writes).toEqual([]);
    expect(forceExit).not.toHaveBeenCalled();
  });

  it('deduplicates duplicate restart requests into one install flight', async () => {
    let resolveCleanup: (() => void) | null = null;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    );
    const update = new FakeUpdatePort();
    const receiptStore = new MemoryReceiptStore();
    const shutdown = new DesktopShutdownCoordinator({ cleanup });
    const forceExit = vi.fn();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
      handoffWatchdogMs: 60_000,
    });

    const first = coordinator.requestRestartAndInstall();
    const second = coordinator.requestRestartAndInstall();

    expect(first).toBe(second);
    expect(update.beginRestartAndInstall).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));

    resolveCleanup?.();
    await first;

    expect(update.handoffInstall).toHaveBeenCalledTimes(1);
  });

  it('writes restart, shutdown, and handoff receipt stages around destructive cleanup', async () => {
    const update = new FakeUpdatePort();
    const receiptStore = new MemoryReceiptStore();
    const { shutdown } = completedShutdown();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit: vi.fn(),
      now: () => new Date('2026-09-30T08:30:00.000Z'),
      handoffWatchdogMs: 60_000,
    });

    const snapshot = await coordinator.requestRestartAndInstall();

    expect(snapshot.state.type).toBe('restarting');
    await vi.waitFor(() => expect(receiptStore.writes).toHaveLength(3));
    expect(receiptStore.writes).toEqual([
      {
        previousVersion: '1.2.2',
        expectedVersion: '1.2.3',
        requestedAt: '2026-09-30T08:30:00.000Z',
        stage: 'restart-requested',
      },
      {
        previousVersion: '1.2.2',
        expectedVersion: '1.2.3',
        requestedAt: '2026-09-30T08:30:00.000Z',
        stage: 'shutdown-complete',
      },
      {
        previousVersion: '1.2.2',
        expectedVersion: '1.2.3',
        requestedAt: '2026-09-30T08:30:00.000Z',
        stage: 'installer-handoff',
      },
    ]);
    expect(shutdown.shouldAllowProcessExit).toBe(true);
    expect(update.handoffInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps the app in a retryable failed state if the initial receipt cannot be persisted', async () => {
    const update = new FakeUpdatePort();
    const receiptStore = new MemoryReceiptStore();
    receiptStore.failWrites = true;
    const { shutdown, cleanup } = completedShutdown();
    const forceExit = vi.fn();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
    });

    const failed = await coordinator.requestRestartAndInstall();

    expect(failed.state).toMatchObject({
      type: 'failed',
      operation: 'install',
      recoverableTo: 'ready',
      failure: {
        code: 'install-receipt-failed',
        retryable: true,
      },
    });
    expect(cleanup).not.toHaveBeenCalled();
    expect(forceExit).not.toHaveBeenCalled();

    receiptStore.failWrites = false;
    update.snapshot = {
      ...update.snapshot,
      state: {
        type: 'ready',
        intent: 'explicit',
        release,
      },
    };
    await coordinator.requestRestartAndInstall();
    expect(update.beginRestartAndInstall).toHaveBeenCalledTimes(2);
  });

  it('never hands off an update when shared shutdown fails', async () => {
    const update = new FakeUpdatePort();
    const receiptStore = new MemoryReceiptStore();
    const shutdown = new DesktopShutdownCoordinator({
      cleanup: vi.fn(async () => {
        throw new Error('cleanup failed');
      }),
    });
    const forceExit = vi.fn();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
    });

    const failed = await coordinator.requestRestartAndInstall();

    expect(failed.state).toMatchObject({
      type: 'failed',
      operation: 'install',
      failure: { code: 'shutdown-failed' },
    });
    expect(update.handoffInstall).not.toHaveBeenCalled();
    expect(shutdown.shouldAllowProcessExit).toBe(true);
    expect(forceExit).toHaveBeenCalledTimes(1);
  });

  it('does not steal terminal ownership if normal quit acquired shutdown first', async () => {
    let resolveCleanup: (() => void) | null = null;
    const shutdown = new DesktopShutdownCoordinator({
      cleanup: () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    });
    const normalQuit = shutdown.request('normal-quit');

    const update = new FakeUpdatePort();
    const receiptStore = new MemoryReceiptStore();
    const forceExit = vi.fn();
    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
    });

    const install = coordinator.requestRestartAndInstall();
    resolveCleanup?.();
    await normalQuit;
    const failed = await install;

    expect(failed.state).toMatchObject({
      type: 'failed',
      failure: { code: 'shutdown-failed' },
    });
    expect(update.handoffInstall).not.toHaveBeenCalled();
    expect(forceExit).not.toHaveBeenCalled();
    expect(shutdown.currentOwnerReason).toBe('normal-quit');
  });

  it('forces process exit if installer handoff throws after destructive cleanup', async () => {
    const update = new FakeUpdatePort();
    update.handoffInstall.mockImplementationOnce(() => {
      throw new Error('/private/cache/installer failed');
    });
    const receiptStore = new MemoryReceiptStore();
    const { shutdown } = completedShutdown();
    const forceExit = vi.fn();

    const coordinator = new UpdateInstallCoordinator({
      update,
      shutdown,
      receiptStore,
      forceExit,
    });

    const failed = await coordinator.requestRestartAndInstall();

    expect(failed.state).toMatchObject({
      type: 'failed',
      failure: {
        code: 'install-handoff-failed',
        retryable: true,
      },
    });
    expect(forceExit).toHaveBeenCalledTimes(1);
  });

  it('uses a bounded watchdog when quitAndInstall returns but the old process stays alive', async () => {
    vi.useFakeTimers();
    try {
      const update = new FakeUpdatePort();
      const receiptStore = new MemoryReceiptStore();
      const { shutdown } = completedShutdown();
      const forceExit = vi.fn();

      const coordinator = new UpdateInstallCoordinator({
        update,
        shutdown,
        receiptStore,
        forceExit,
        handoffWatchdogMs: 15_000,
      });

      await coordinator.requestRestartAndInstall();
      expect(forceExit).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(14_999);
      expect(forceExit).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(forceExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
