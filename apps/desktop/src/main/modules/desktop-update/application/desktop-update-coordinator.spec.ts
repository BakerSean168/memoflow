import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopUpdateFailureDTO,
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { capabilitiesForInstallationOwner } from '../domain/installation-ownership';
import {
  DesktopUpdateEngineError,
  type DesktopUpdateEngine,
  type DesktopUpdateEngineCheckResult,
  type DesktopUpdateEngineEvent,
  type DesktopUpdateEngineInitOptions,
} from './desktop-update-engine';
import {
  DesktopUpdateCoordinator,
  DEFAULT_DESKTOP_UPDATE_POLICY,
} from './desktop-update-coordinator';

const release: DesktopUpdateReleaseDTO = {
  version: '1.2.3',
  channel: 'stable',
  publishedAt: '2026-09-30T00:00:00.000Z',
  releaseNotes: 'Release',
  releaseNotesUrl: null,
};

class FakeEngine implements DesktopUpdateEngine {
  private readonly listeners = new Set<(event: DesktopUpdateEngineEvent) => void>();

  readonly initialize = vi.fn(async (_options: DesktopUpdateEngineInitOptions) => undefined);
  readonly check = vi.fn<() => Promise<DesktopUpdateEngineCheckResult>>(async () => ({
    kind: 'up-to-date',
  }));
  readonly download = vi.fn(async () => undefined);
  readonly prepare = vi.fn(async () => undefined);
  readonly quitAndInstall = vi.fn();
  readonly destroy = vi.fn();

  subscribe(listener: (event: DesktopUpdateEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: DesktopUpdateEngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

function directCoordinator(
  engine: FakeEngine,
  overrides: Partial<ConstructorParameters<typeof DesktopUpdateCoordinator>[0]> = {},
) {
  return new DesktopUpdateCoordinator({
    engine,
    currentVersion: '1.2.2',
    owner: 'memoflow-direct',
    capabilities: capabilitiesForInstallationOwner('memoflow-direct'),
    policy: { mode: 'manual' },
    now: () => new Date('2026-09-30T01:00:00.000Z'),
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DesktopUpdateCoordinator', () => {
  it('keeps a frozen bounded observation with the exact idle settlement timestamp', async () => {
    const engine = new FakeEngine();
    const now = vi.fn(() => new Date('2026-10-01T12:00:00.000Z'));
    const coordinator = directCoordinator(engine, {
      now,
      feed: { provider: 'generic', url: 'https://secret.test', channel: 'latest' },
    });
    expect(coordinator.getDiagnosticsObservation()).toEqual({
      feedClass: 'generic',
      lastCheckedAt: null,
      lastCheckResult: null,
    });
    expect(Object.isFrozen(coordinator.getDiagnosticsObservation())).toBe(true);
    await coordinator.initialize();
    await coordinator.check();
    const observation = coordinator.getDiagnosticsObservation();
    expect(observation.lastCheckResult).toBe('up-to-date');
    expect(coordinator.getSnapshot().state).toMatchObject({
      lastCheckedAt: observation.lastCheckedAt,
    });
    expect(now).toHaveBeenCalledTimes(2); // start and settlement
  });

  it('settles a native check failure once despite duplicate events and promise rejection', async () => {
    const engine = new FakeEngine();
    let rejectCheck!: (error: unknown) => void;
    engine.check.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCheck = reject;
        }),
    );
    const now = vi.fn(() => new Date('2026-10-01T12:00:00.000Z'));
    const coordinator = directCoordinator(engine, { now });
    await coordinator.initialize();
    const pending = coordinator.check();
    const event: DesktopUpdateEngineEvent = {
      type: 'engine-error',
      failure: { code: 'feed-unavailable', message: 'Failed', retryable: true },
    };
    engine.emit(event);
    const settled = coordinator.getDiagnosticsObservation();
    engine.emit(event);
    rejectCheck(new Error('late failure'));
    await pending;
    expect(coordinator.getDiagnosticsObservation()).toEqual(settled);
    expect(settled.lastCheckResult).toBe('failed');
    expect(now).toHaveBeenCalledTimes(2);
  });

  it.each(['download', 'prepare', 'install'] as const)(
    'keeps available observation after a later %s failure',
    async (operation) => {
      const engine = new FakeEngine();
      engine.check.mockResolvedValue({ kind: 'available', release });
      if (operation === 'download') engine.download.mockRejectedValue(new Error('Failed'));
      if (operation === 'prepare') engine.prepare.mockRejectedValue(new Error('Failed'));
      const coordinator = directCoordinator(engine);
      await coordinator.initialize();
      await coordinator.check();
      await vi.waitFor(() =>
        expect(coordinator.getSnapshot().state.type).toBe(
          operation === 'install' ? 'ready' : 'failed',
        ),
      );
      if (operation === 'install') {
        coordinator.beginRestartAndInstall();
        coordinator.failInstall({
          code: 'install-handoff-failed',
          message: 'Failed',
          retryable: true,
        });
      }
      expect(coordinator.getDiagnosticsObservation()).toEqual({
        feedClass: 'none',
        lastCheckedAt: '2026-09-30T01:00:00.000Z',
        lastCheckResult: 'update-available',
      });
    },
  );
  it('initializes the engine once and exposes an idle replayable snapshot', async () => {
    const engine = new FakeEngine();
    const coordinator = directCoordinator(engine);

    const first = await coordinator.initialize();
    const second = await coordinator.initialize();

    expect(engine.initialize).toHaveBeenCalledTimes(1);
    expect(engine.initialize).toHaveBeenCalledWith({ channel: 'stable' });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: {
        type: 'idle',
        currentVersion: '1.2.2',
      },
      currentVersion: '1.2.2',
      owner: 'memoflow-direct',
      channel: 'stable',
    });
  });

  it('disables unsupported installations without loading the update engine', async () => {
    const engine = new FakeEngine();
    const coordinator = new DesktopUpdateCoordinator({
      engine,
      currentVersion: '1.2.2',
      owner: 'unsupported',
      capabilities: capabilitiesForInstallationOwner('unsupported'),
      disabledReason: 'development-build',
    });

    const snapshot = await coordinator.initialize();

    expect(engine.initialize).not.toHaveBeenCalled();
    expect(snapshot.state).toEqual({
      type: 'disabled',
      reason: 'development-build',
    });
  });

  it('keeps manual and background check intent in the canonical state', async () => {
    const engine = new FakeEngine();
    let resolveCheck: ((result: DesktopUpdateEngineCheckResult) => void) | null = null;
    engine.check.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const coordinator = directCoordinator(engine);
    await coordinator.initialize();

    const pending = coordinator.check('explicit');

    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'checking',
      intent: 'explicit',
    });

    resolveCheck?.({ kind: 'up-to-date' });
    await pending;

    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'idle',
      lastOutcome: 'up-to-date',
    });
  });

  it('deduplicates concurrent checks into one engine request', async () => {
    const engine = new FakeEngine();
    let resolveCheck: ((result: DesktopUpdateEngineCheckResult) => void) | null = null;
    engine.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const coordinator = directCoordinator(engine);
    await coordinator.initialize();

    const first = coordinator.check('explicit');
    const second = coordinator.check('explicit');

    expect(engine.check).toHaveBeenCalledTimes(1);

    resolveCheck?.({ kind: 'up-to-date' });
    await Promise.all([first, second]);

    expect(engine.check).toHaveBeenCalledTimes(1);
  });

  it('automatically downloads, prepares, and reaches ready for eligible direct installs', async () => {
    const engine = new FakeEngine();
    engine.check.mockResolvedValue({ kind: 'available', release });
    engine.download.mockImplementation(async () => {
      engine.emit({
        type: 'download-progress',
        progress: {
          percent: 50,
          transferredBytes: 50,
          totalBytes: 100,
          bytesPerSecond: 10,
        },
      });
      engine.emit({ type: 'downloaded', release });
    });

    const coordinator = directCoordinator(engine, {
      policy: {
        mode: 'manual',
        autoDownload: true,
      },
    });
    const snapshots: DesktopUpdateSnapshotDTO[] = [];
    coordinator.subscribe((snapshot) => snapshots.push(snapshot));
    await coordinator.initialize();

    const checked = await coordinator.check('explicit');
    expect(['available', 'downloading', 'downloaded', 'preparing', 'ready']).toContain(
      checked.state.type,
    );

    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().state.type).toBe('ready');
    });

    expect(engine.download).toHaveBeenCalledTimes(1);
    expect(engine.prepare).toHaveBeenCalledTimes(1);
    expect(snapshots.some((snapshot) => snapshot.state.type === 'downloading')).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.state.type === 'downloaded')).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.state.type === 'preparing')).toBe(true);
    expect(snapshots.at(-1)?.state.type).toBe('ready');
    expect(coordinator.getDiagnosticsObservation().lastCheckResult).toBe('update-available');
  });

  it('does not self-download a package-manager-owned update', async () => {
    const engine = new FakeEngine();
    engine.check.mockResolvedValue({ kind: 'available', release });

    const coordinator = new DesktopUpdateCoordinator({
      engine,
      currentVersion: '1.2.2',
      owner: 'package-manager',
      capabilities: capabilitiesForInstallationOwner('package-manager'),
      policy: { mode: 'manual', autoDownload: true },
    });
    await coordinator.initialize();

    const snapshot = await coordinator.check('explicit');

    expect(snapshot.state).toMatchObject({
      type: 'available',
      autoDownloadEligible: false,
    });
    expect(engine.download).not.toHaveBeenCalled();
  });

  it('recovers a failed check before an explicit retry', async () => {
    const engine = new FakeEngine();
    const failure: DesktopUpdateFailureDTO = {
      code: 'feed-unavailable',
      message: 'Unable to check the update feed.',
      retryable: true,
    };
    engine.check
      .mockRejectedValueOnce(new DesktopUpdateEngineError(failure))
      .mockResolvedValueOnce({ kind: 'up-to-date' });

    const coordinator = directCoordinator(engine);
    await coordinator.initialize();

    await coordinator.check('background');
    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'failed',
      operation: 'check',
      recoverableTo: 'idle',
      failure,
    });

    await coordinator.check('explicit');

    expect(engine.check).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'idle',
      lastOutcome: 'up-to-date',
    });
  });

  it('recovers a retryable install failure back through ready before restarting again', async () => {
    const engine = new FakeEngine();
    engine.check.mockResolvedValue({ kind: 'available', release });
    engine.download.mockImplementation(async () => {
      engine.emit({ type: 'downloaded', release });
    });
    const coordinator = directCoordinator(engine, {
      policy: { mode: 'manual', autoDownload: true },
    });
    await coordinator.initialize();
    await coordinator.check('explicit');
    await vi.waitFor(() => expect(coordinator.getSnapshot().state.type).toBe('ready'));

    coordinator.beginRestartAndInstall();
    expect(coordinator.getSnapshot().state.type).toBe('restarting');

    coordinator.failInstall({
      code: 'install-receipt-failed',
      message: 'Unable to record the pending update before restart.',
      retryable: true,
    });
    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'failed',
      recoverableTo: 'ready',
    });

    coordinator.beginRestartAndInstall();
    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'restarting',
      release,
    });
  });

  it('schedules delayed startup and periodic background checks in the shell', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T01:00:00.000Z'));
    const engine = new FakeEngine();
    const coordinator = directCoordinator(engine, {
      policy: {
        mode: 'periodic',
        startupDelayMs: 30_000,
        intervalMs: 60 * 60 * 1000,
        autoDownload: true,
      },
      now: () => new Date(),
    });

    await coordinator.initialize();
    expect(engine.check).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(engine.check).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(engine.check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEFAULT_DESKTOP_UPDATE_POLICY.intervalMs - 30_000);
    expect(engine.check).toHaveBeenCalledTimes(2);

    coordinator.destroy();
  });

  it('projects spontaneous engine errors into the active operation without raw provider state', async () => {
    const engine = new FakeEngine();
    let resolveCheck: ((result: DesktopUpdateEngineCheckResult) => void) | null = null;
    engine.check.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const coordinator = directCoordinator(engine);
    await coordinator.initialize();

    const pending = coordinator.check('background');
    engine.emit({
      type: 'engine-error',
      failure: {
        code: 'feed-unavailable',
        message: 'Unable to check the update feed.',
        retryable: true,
      },
    });

    expect(coordinator.getSnapshot().state).toMatchObject({
      type: 'failed',
      operation: 'check',
    });

    resolveCheck?.({ kind: 'up-to-date' });
    await pending;

    expect(coordinator.getSnapshot().state.type).toBe('failed');
  });

  it('clears timers and engine subscriptions on destroy', async () => {
    vi.useFakeTimers();
    const engine = new FakeEngine();
    const coordinator = directCoordinator(engine, {
      policy: {
        mode: 'periodic',
        startupDelayMs: 30_000,
        intervalMs: 60_000,
        autoDownload: true,
      },
    });
    await coordinator.initialize();

    expect(engine.listenerCount()).toBe(1);

    coordinator.destroy();

    expect(engine.listenerCount()).toBe(0);
    expect(engine.destroy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(engine.check).not.toHaveBeenCalled();
  });
});
