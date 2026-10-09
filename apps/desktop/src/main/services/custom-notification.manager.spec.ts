import { BrowserWindow, ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannels, RendererEventChannels } from '@memoflow/contracts/electron';
import { CustomNotificationManager } from './custom-notification.manager';

describe('CustomNotificationManager lifecycle', () => {
  let manager: CustomNotificationManager;
  let main: BrowserWindow;
  type Handler = (...args: unknown[]) => unknown;
  const handlers = new Map<string, Handler>();
  const window = () => BrowserWindow.getAllWindows().find((win) => win !== main)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlers.clear();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    main = new BrowserWindow({});
    manager = new CustomNotificationManager({ getMainWindow: () => main });
  });
  afterEach(() => {
    manager.destroy?.();
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    vi.useRealTimers();
  });

  it.each([
    { distinct: 10, expected: 10 },
    { distinct: 100, expected: 32 },
  ])('bounds and coalesces $distinct pending notifications', ({ distinct, expected }) => {
    for (let index = 0; index < 100; index++) {
      manager.dispatch({
        title: String(index),
        body: 'Body',
        data: { notificationId: `notification-${index % distinct}` },
      });
    }
    const toast = window();
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({ sender: toast.webContents });
    expect(toast.webContents.send).toHaveBeenCalledTimes(expected);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroys a window that never becomes ready, then permits a later notification', async () => {
    manager.dispatch({ title: 'First', body: '' });
    const first = window();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.isDestroyed()).toBe(true);
    manager.dispatch({ title: 'Next', body: '' });
    expect(window()).not.toBe(first);
    manager.clearPresentation();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores foreign senders and uses the host-owned payload for clicks', () => {
    manager.dispatch({
      title: 'Trusted',
      body: '',
      data: { notificationId: 'n-1', target: 'trusted' },
    });
    const toast = window();
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({ sender: main.webContents });
    expect(toast.webContents.send).not.toHaveBeenCalled();
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({ sender: toast.webContents });
    const payload = vi.mocked(toast.webContents.send).mock.calls[0]![1];
    handlers.get(NotificationChannels.CUSTOM_CLICK)!({ sender: toast.webContents }, payload.id, {
      target: 'untrusted',
    });
    expect(main.webContents.send).toHaveBeenCalledWith(RendererEventChannels.NOTIFICATION_CLICKED, {
      notificationId: 'n-1',
      target: 'trusted',
    });
    manager.destroy();
    expect(toast.isDestroyed()).toBe(true);
    const count = BrowserWindow.getAllWindows().length;
    manager.dispatch({ title: 'After shutdown', body: '' });
    expect(BrowserWindow.getAllWindows()).toHaveLength(count);
  });
});
