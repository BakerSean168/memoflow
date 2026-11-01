import { describe, expect, it, vi } from 'vitest';
import { RendererEventChannels, SystemChannels } from '@memoflow/desktop-contracts';
import { registerSystemNotice } from './system-notice';

const sonner = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('vue-sonner', () => ({ toast: sonner }));

function createBridge() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      listeners.set(channel, callback);
    }),
    off: vi.fn((channel: string) => {
      listeners.delete(channel);
    }),
    invoke: vi.fn(async () => ({ delivered: [] })),
    emit(channel: string, payload: unknown) {
      listeners.get(channel)?.(payload);
    },
  };
}

describe('registerSystemNotice', () => {
  it('reports readiness, translates the notice id, and ignores duplicates', async () => {
    const bridge = createBridge();
    const translate = vi.fn((key: string) => `t:${key}`);
    const dispose = registerSystemNotice(bridge, translate);

    expect(bridge.invoke).toHaveBeenCalledWith(SystemChannels.SYSTEM_NOTICE_READY);

    bridge.emit(RendererEventChannels.SYSTEM_NOTICE, { id: 'tray-unavailable' });
    expect(translate).toHaveBeenCalledWith('shell.systemNotice.trayUnavailable');
    expect(sonner.warning).toHaveBeenCalledWith('t:shell.systemNotice.trayUnavailable', {
      duration: 6000,
    });

    bridge.emit(RendererEventChannels.SYSTEM_NOTICE, { id: 'tray-unavailable' });
    expect(sonner.warning).toHaveBeenCalledTimes(1);

    bridge.emit(RendererEventChannels.SYSTEM_NOTICE, { id: 'not-a-real-notice' });
    expect(sonner.warning).toHaveBeenCalledTimes(1);

    dispose();
    expect(bridge.off).toHaveBeenCalledWith(
      RendererEventChannels.SYSTEM_NOTICE,
      expect.any(Function),
    );
  });
});
