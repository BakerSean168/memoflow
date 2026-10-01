import { describe, expect, it, vi } from 'vitest';
import { DesktopUpdateChannels, type DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { ok, ResultCode } from '@memoflow/contracts/result';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';
import { createDesktopUpdateService } from './desktop-update-service';

function snapshot(type: 'idle' | 'ready' = 'idle'): DesktopUpdateSnapshotDTO {
  return {
    state:
      type === 'idle'
        ? {
            type: 'idle',
            currentVersion: '1.2.2',
            lastCheckedAt: null,
            lastOutcome: null,
          }
        : {
            type: 'ready',
            intent: 'explicit',
            release: {
              version: '1.2.3',
              channel: 'stable',
              publishedAt: null,
              releaseNotes: null,
              releaseNotesUrl: null,
            },
          },
    currentVersion: '1.2.2',
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities: {
      canCheck: true,
      canBackgroundCheck: true,
      canDownload: true,
      canSelfInstall: true,
      canAutoDownload: true,
      installAuthority: 'memoflow',
    },
  };
}

function createHarness() {
  const invoke = vi.fn();
  const ipc: IResultIpcClient = {
    invoke: invoke as IResultIpcClient['invoke'],
  };

  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const bridge: ElectronBridge = {
    invoke: vi.fn(),
    on: vi.fn((channel, callback) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(callback);
      listeners.set(channel, channelListeners);
    }),
    off: vi.fn((channel, callback) => {
      listeners.get(channel)?.delete(callback);
    }),
  };

  return {
    invoke,
    bridge,
    service: createDesktopUpdateService(ipc, bridge),
    emit(channel: string, payload: unknown) {
      for (const listener of listeners.get(channel) ?? []) {
        listener(payload);
      }
    },
  };
}

describe('createDesktopUpdateService', () => {
  it('invokes and validates bounded diagnostics', async () => {
    const harness = createHarness();
    const current = snapshot();
    const diagnostics = {
      currentVersion: current.currentVersion,
      targetVersion: null,
      owner: current.owner,
      capabilities: current.capabilities,
      state: 'idle',
      feedClass: 'github',
      lastCheckedAt: null,
      lastCheckResult: null,
      failure: null,
      installReceipt: { status: 'none', requestedAt: null },
    };
    harness.invoke.mockResolvedValue(ok(diagnostics));
    await expect(harness.service.getDiagnostics()).resolves.toEqual(ok(diagnostics));
    expect(harness.invoke).toHaveBeenCalledWith(DesktopUpdateChannels.GET_DIAGNOSTICS);
    for (const payload of [
      {},
      { ...diagnostics, state: 'invalid' },
      { ...diagnostics, feedUrl: 'https://secret.test/token' },
      { ...diagnostics, path: '/private/secret' },
    ]) {
      harness.invoke.mockResolvedValue(ok(payload));
      await expect(harness.service.getDiagnostics()).resolves.toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Desktop update returned invalid diagnostics.' },
        meta: undefined,
      });
    }
  });
  it('maps the three host-neutral commands to canonical Desktop Update IPC', async () => {
    const harness = createHarness();
    const current = snapshot();
    harness.invoke.mockResolvedValue(ok(current));

    await expect(harness.service.getSnapshot()).resolves.toEqual(ok(current));
    await expect(harness.service.check()).resolves.toEqual(ok(current));
    await expect(harness.service.restartAndInstall()).resolves.toEqual(ok(current));

    expect(harness.invoke.mock.calls).toEqual([
      [DesktopUpdateChannels.GET_SNAPSHOT],
      [DesktopUpdateChannels.CHECK],
      [DesktopUpdateChannels.RESTART_AND_INSTALL],
    ]);
  });

  it('fails closed when an invoke returns a malformed snapshot', async () => {
    const harness = createHarness();
    harness.invoke.mockResolvedValue(ok({ provider: 'github', path: 'secret' }));

    const result = await harness.service.getSnapshot();

    expect(result).toEqual({
      ok: false,
      error: {
        code: ResultCode.INTERNAL_ERROR,
        message: 'Desktop update returned an invalid snapshot.',
      },
      meta: undefined,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('forwards only validated STATE_CHANGED snapshots', () => {
    const harness = createHarness();
    const listener = vi.fn();
    harness.service.subscribe(listener);

    harness.emit(DesktopUpdateChannels.STATE_CHANGED, {
      ...snapshot(),
      provider: 'github',
    });
    expect(listener).not.toHaveBeenCalled();

    const ready = snapshot('ready');
    harness.emit(DesktopUpdateChannels.STATE_CHANGED, ready);
    expect(listener).toHaveBeenCalledWith(ready);
  });

  it('unsubscribes exactly once and ignores late events', () => {
    const harness = createHarness();
    const listener = vi.fn();
    const unsubscribe = harness.service.subscribe(listener);

    unsubscribe();
    unsubscribe();
    harness.emit(DesktopUpdateChannels.STATE_CHANGED, snapshot('ready'));

    expect(harness.bridge.off).toHaveBeenCalledTimes(1);
    expect(harness.bridge.off).toHaveBeenCalledWith(
      DesktopUpdateChannels.STATE_CHANGED,
      expect.any(Function),
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
