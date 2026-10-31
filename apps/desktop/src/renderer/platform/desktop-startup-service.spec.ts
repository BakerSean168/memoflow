import { describe, expect, it, vi } from 'vitest';
import { DesktopStartupChannels } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';
import { createDesktopStartupService } from './desktop-startup-service';

const snapshot = {
  autoLaunch: { available: true, enabled: false },
  closeToTray: true,
  startHidden: true,
};
describe('desktop startup renderer adapter', () => {
  it('validates responses and passes patches and failure snapshots through', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(ok(snapshot))
      .mockResolvedValueOnce(ok({ success: false, snapshot }))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(fail({ code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' }));
    const service = createDesktopStartupService(
      { invoke } as IResultIpcClient,
      { on: vi.fn(), off: vi.fn() } as unknown as ElectronBridge,
    );
    expect(await service.get()).toEqual(ok(snapshot));
    expect(await service.update({ autoLaunch: true })).toEqual(ok({ success: false, snapshot }));
    expect(invoke).toHaveBeenCalledWith(DesktopStartupChannels.UPDATE, { autoLaunch: true });
    expect((await service.get()).ok).toBe(false);
    expect((await service.get()).ok).toBe(false);
  });
  it('accepts only valid changed events and stops delivery after unsubscribe', () => {
    const bridge = { on: vi.fn(), off: vi.fn() };
    const service = createDesktopStartupService(
      { invoke: vi.fn() } as IResultIpcClient,
      bridge as unknown as ElectronBridge,
    );
    const listener = vi.fn();
    const off = service.subscribe(listener);
    const handler = bridge.on.mock.calls[0][1];
    handler({});
    handler(snapshot);
    expect(listener).toHaveBeenCalledExactlyOnceWith(snapshot);
    off();
    handler(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(bridge.off).toHaveBeenCalledWith(DesktopStartupChannels.CHANGED, handler);
  });
});
