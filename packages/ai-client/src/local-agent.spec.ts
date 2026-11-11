import { describe, expect, it, vi } from 'vitest';
import { AIStreamChannels } from '@memoflow/desktop-contracts';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';
import { createLocalAgentIpcClient } from './local-agent';

function bridgeHarness() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const bridge: ElectronBridge = {
    invoke: vi.fn(),
    on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(callback);
      listeners.set(channel, set);
    }),
    off: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(callback);
    }),
  };
  const emit = (channel: string, payload: unknown) => {
    for (const callback of listeners.get(channel) ?? []) callback(payload);
  };
  return { bridge, emit };
}

const ipc = (bridge?: ElectronBridge): IResultIpcClient => ({
  invoke: vi.fn(),
  ...(bridge ? { getBridge: () => bridge } : {}),
});

describe('local Agent catalog subscription', () => {
  it('subscribes to the catalog channel, validates payloads and unsubscribes once', () => {
    const { bridge, emit } = bridgeHarness();
    const client = createLocalAgentIpcClient(ipc(bridge));
    const listener = vi.fn();
    const unsubscribe = client.subscribeCatalog(listener);

    expect(bridge.on).toHaveBeenCalledWith(
      AIStreamChannels.LOCAL_AGENT_CATALOG,
      expect.any(Function),
    );
    emit(AIStreamChannels.LOCAL_AGENT_CATALOG, {
      key: 'connection-1',
      status: { status: 'ready', models: [{ id: 'model-1', name: 'Model 1' }] },
    });
    expect(listener).toHaveBeenCalledWith({
      key: 'connection-1',
      status: { status: 'ready', models: [{ id: 'model-1', name: 'Model 1' }] },
    });

    emit(AIStreamChannels.LOCAL_AGENT_CATALOG, { key: 'implicit:codex', status: null });
    expect(listener).toHaveBeenLastCalledWith({ key: 'implicit:codex', status: null });

    // Malformed payloads are ignored instead of reaching renderer state.
    emit(AIStreamChannels.LOCAL_AGENT_CATALOG, { key: '', status: null });
    emit(AIStreamChannels.LOCAL_AGENT_CATALOG, {
      key: 'connection-1',
      status: { status: 'ready', models: [] },
      account: { type: 'chatgpt' },
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    unsubscribe();
    expect(bridge.off).toHaveBeenCalledTimes(1);
    emit(AIStreamChannels.LOCAL_AGENT_CATALOG, { key: 'connection-1', status: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns a no-op unsubscribe when the host has no Electron bridge', () => {
    const client = createLocalAgentIpcClient(ipc());
    const listener = vi.fn();
    const unsubscribe = client.subscribeCatalog(listener);
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
