import { describe, expect, it, vi } from 'vitest';
import { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';

describe('DesktopShutdownCoordinator', () => {
  it('runs normal quit cleanup exactly once', async () => {
    const cleanup = vi.fn(async () => undefined);
    const coordinator = new DesktopShutdownCoordinator({
      cleanup,
      now: () => new Date('2026-09-30T08:00:00.000Z'),
    });

    const first = coordinator.request('normal-quit');
    const second = coordinator.request('normal-quit');

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        reason: 'normal-quit',
        status: 'completed',
        startedAt: '2026-09-30T08:00:00.000Z',
        settledAt: '2026-09-30T08:00:00.000Z',
      },
      {
        reason: 'normal-quit',
        status: 'completed',
        startedAt: '2026-09-30T08:00:00.000Z',
        settledAt: '2026-09-30T08:00:00.000Z',
      },
    ]);

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('publishes single-flight ownership before cleanup can synchronously re-enter', async () => {
    let nested: Promise<unknown> | null = null;
    const holder: { coordinator: DesktopShutdownCoordinator | null } = { coordinator: null };
    const cleanup = vi.fn(async () => {
      nested = holder.coordinator!.request('normal-quit');
    });
    const coordinator = new DesktopShutdownCoordinator({ cleanup });
    holder.coordinator = coordinator;

    const updateInstall = coordinator.request('update-install');

    expect(nested).toBe(updateInstall);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(coordinator.currentOwnerReason).toBe('update-install');

    await expect(updateInstall).resolves.toMatchObject({
      reason: 'update-install',
      status: 'completed',
    });
  });

  it('lets the first concurrent shutdown reason own the cleanup attempt', async () => {
    let resolveCleanup: (() => void) | null = null;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    );
    const coordinator = new DesktopShutdownCoordinator({ cleanup });

    const updateInstall = coordinator.request('update-install');
    const normalQuit = coordinator.request('normal-quit');

    expect(coordinator.currentOwnerReason).toBe('update-install');
    expect(coordinator.currentPhase).toBe('cleaning');
    expect(cleanup).toHaveBeenCalledTimes(1);

    resolveCleanup?.();

    const [first, second] = await Promise.all([updateInstall, normalQuit]);
    expect(first.reason).toBe('update-install');
    expect(second).toBe(first);
    expect(cleanup).toHaveBeenCalledWith('update-install');
  });

  it('settles cleanup failures instead of throwing past the lifecycle boundary', async () => {
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: vi.fn(async () => {
        throw new Error('/private/profile/path failed');
      }),
      now: () => new Date('2026-09-30T08:00:00.000Z'),
    });

    await expect(coordinator.request('normal-quit')).resolves.toEqual({
      reason: 'normal-quit',
      status: 'failed',
      startedAt: '2026-09-30T08:00:00.000Z',
      settledAt: '2026-09-30T08:00:00.000Z',
    });
    expect(coordinator.currentPhase).toBe('settled');
  });

  it('settles a hung cleanup after the configured safety timeout', async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new DesktopShutdownCoordinator({
        cleanup: vi.fn(() => new Promise<void>(() => undefined)),
        timeoutMs: 10_000,
        now: () => new Date('2026-09-30T08:00:00.000Z'),
      });

      const pending = coordinator.request('normal-quit');
      await vi.advanceTimersByTimeAsync(9_999);
      expect(coordinator.currentPhase).toBe('cleaning');

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        reason: 'normal-quit',
        status: 'timed-out',
      });
      expect(coordinator.currentPhase).toBe('settled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires cleanup settlement before terminal process exit', async () => {
    let resolveCleanup: (() => void) | null = null;
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    });

    const pending = coordinator.request('update-install');
    expect(() => coordinator.beginTerminalExit('update-install')).toThrow(
      'Desktop shutdown cannot enter terminal exit before cleanup settles',
    );

    resolveCleanup?.();
    await pending;

    coordinator.beginTerminalExit('update-install');
    expect(coordinator.shouldAllowProcessExit).toBe(true);
    expect(coordinator.currentPhase).toBe('terminal-exit');
  });

  it('rejects a terminal exit from a caller that did not own shutdown', async () => {
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: vi.fn(async () => undefined),
    });

    await coordinator.request('normal-quit');

    expect(() => coordinator.beginTerminalExit('update-install')).toThrow(
      /terminal exit owner mismatch/u,
    );
    expect(coordinator.shouldAllowProcessExit).toBe(false);
  });
});
