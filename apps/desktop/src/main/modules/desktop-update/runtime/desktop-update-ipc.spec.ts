import { describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { DesktopUpdateChannels } from '@memoflow/contracts/electron';
import {
  registerDesktopUpdateIpc,
  type DesktopUpdateIpcBroadcastPort,
  type DesktopUpdateIpcInstallPort,
  type DesktopUpdateIpcMainPort,
  type DesktopUpdateIpcUpdatePort,
} from './desktop-update-ipc';

const capabilities = {
  canCheck: true,
  canBackgroundCheck: true,
  canDownload: true,
  canSelfInstall: true,
  canAutoDownload: true,
  installAuthority: 'memoflow' as const,
};

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
    capabilities,
  };
}

function createHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipc: DesktopUpdateIpcMainPort = {
    handle: vi.fn((channel, listener) => {
      if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
      handlers.set(channel, listener);
    }),
    removeHandler: vi.fn((channel) => {
      handlers.delete(channel);
    }),
  };

  let current = snapshot();
  const listeners = new Set<(value: DesktopUpdateSnapshotDTO) => void>();
  const update: DesktopUpdateIpcUpdatePort = {
    getSnapshot: vi.fn(() => current),
    check: vi.fn(async () => current),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  const install: DesktopUpdateIpcInstallPort = {
    requestRestartAndInstall: vi.fn(async () => current),
  };
  const broadcast: DesktopUpdateIpcBroadcastPort = {
    send: vi.fn(),
  };

  const runtime = registerDesktopUpdateIpc({ update, install, ipc, broadcast });

  return {
    runtime,
    handlers,
    ipc,
    update,
    install,
    broadcast,
    setSnapshot(value: DesktopUpdateSnapshotDTO) {
      current = value;
    },
    emit(value: DesktopUpdateSnapshotDTO) {
      for (const listener of listeners) listener(value);
    },
  };
}

describe('registerDesktopUpdateIpc', () => {
  it('registers only the three request-response channels', () => {
    const harness = createHarness();

    expect([...harness.handlers.keys()].sort()).toEqual(
      [
        DesktopUpdateChannels.GET_SNAPSHOT,
        DesktopUpdateChannels.CHECK,
        DesktopUpdateChannels.RESTART_AND_INSTALL,
      ].sort(),
    );
    expect(harness.handlers.has(DesktopUpdateChannels.STATE_CHANGED)).toBe(false);
  });

  it('returns the replayable renderer-safe snapshot in a Result envelope', async () => {
    const harness = createHarness();
    const handler = harness.handlers.get(DesktopUpdateChannels.GET_SNAPSHOT)!;

    expect(handler()).toEqual({ ok: true, data: snapshot(), meta: undefined });
  });

  it('maps CHECK to one explicit coordinator check', async () => {
    const harness = createHarness();
    const ready = snapshot('ready');
    harness.setSnapshot(ready);
    vi.mocked(harness.update.check).mockResolvedValueOnce(ready);

    const result = await harness.handlers.get(DesktopUpdateChannels.CHECK)!();

    expect(harness.update.check).toHaveBeenCalledWith('explicit');
    expect(result).toEqual({ ok: true, data: ready, meta: undefined });
  });

  it('maps restart/install only to the sole install coordinator', async () => {
    const harness = createHarness();
    const ready = snapshot('ready');
    vi.mocked(harness.install.requestRestartAndInstall).mockResolvedValueOnce(ready);

    const result = await harness.handlers.get(DesktopUpdateChannels.RESTART_AND_INSTALL)!();

    expect(harness.install.requestRestartAndInstall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: ready, meta: undefined });
  });

  it('broadcasts STATE_CHANGED with the exact validated snapshot payload', () => {
    const harness = createHarness();
    const ready = snapshot('ready');

    harness.emit(ready);

    expect(harness.broadcast.send).toHaveBeenCalledWith(DesktopUpdateChannels.STATE_CHANGED, ready);
  });

  it('never leaks raw exception messages through invoke failures', async () => {
    const harness = createHarness();
    vi.mocked(harness.update.check).mockRejectedValueOnce(
      new Error('/private/update-cache/token=secret'),
    );

    const result = await harness.handlers.get(DesktopUpdateChannels.CHECK)!();

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Desktop update operation failed.',
      },
      meta: undefined,
    });
    expect(JSON.stringify(result)).not.toContain('/private/update-cache');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('drops invalid pushed snapshots instead of crossing the preload boundary', () => {
    const harness = createHarness();

    harness.emit({
      ...snapshot(),
      provider: 'github',
    } as DesktopUpdateSnapshotDTO);

    expect(harness.broadcast.send).not.toHaveBeenCalled();
  });

  it('removes handlers and the update subscription exactly once', () => {
    const harness = createHarness();

    harness.runtime.destroy();
    harness.runtime.destroy();
    harness.emit(snapshot('ready'));

    expect(harness.ipc.removeHandler).toHaveBeenCalledTimes(3);
    expect(harness.broadcast.send).not.toHaveBeenCalled();
  });
});
