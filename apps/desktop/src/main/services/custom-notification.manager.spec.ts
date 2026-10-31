import { BrowserWindow, ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannels, RendererEventChannels } from '@memoflow/desktop-contracts';
import { createDefaultElectronDesktopTransport } from '@memoflow/notification';
import { NotificationService } from './notification.service';
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

  it('acknowledges only the matching card after renderer READY and a visible window', async () => {
    let settled = false;
    const delivery = Promise.resolve(
      manager.dispatch({
        title: 'Due',
        body: 'Routine',
        data: { notificationId: 'n-visible' },
      }),
    ).then((value) => {
      settled = true;
      return value;
    });
    const toast = window();
    await Promise.resolve();
    expect(settled).toBe(false);
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
      sender: toast.webContents,
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!(
      { sender: toast.webContents },
      'n-visible',
    );
    handlers.get(NotificationChannels.CUSTOM_RESIZE)!({ sender: toast.webContents }, 160);
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!({ sender: main.webContents }, 'n-visible');
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!({ sender: toast.webContents }, 'unknown');
    await Promise.resolve();
    expect(settled).toBe(false);
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!(
      { sender: toast.webContents },
      'n-visible',
    );
    await expect(delivery).resolves.toBe(true);
  });

  it('keeps the transport ACK delivering until the real service and manager confirm a visible card', async () => {
    const service = new NotificationService(manager);
    const transport = createDefaultElectronDesktopTransport({
      renderer: () =>
        service.showCanonicalDelivery({
          title: 'Due',
          body: '',
          data: { notificationId: 'full-chain' },
        }),
    }) as {
      deliver: (dto: unknown, context: unknown) => Promise<{ status: string }>;
      getAck: (key: string) => Promise<{ status: string } | null>;
    };
    const context = { idempotencyKey: 'full-chain-key' };
    const result = transport.deliver({}, context);
    await vi.advanceTimersByTimeAsync(0);
    const toast = window();
    expect(await transport.getAck(context.idempotencyKey)).toMatchObject({ status: 'delivering' });
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({ sender: toast.webContents });
    expect(await transport.getAck(context.idempotencyKey)).toMatchObject({ status: 'delivering' });
    handlers.get(NotificationChannels.CUSTOM_RESIZE)!({ sender: toast.webContents }, 160);
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!(
      { sender: toast.webContents },
      'full-chain',
    );
    await expect(result).resolves.toMatchObject({ status: 'delivered' });
    await expect(transport.deliver({}, context)).resolves.toMatchObject({ status: 'delivered' });
    expect(toast.webContents.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    'timeout',
    'load-failed',
    'closed',
    'process-gone',
    'send-failed',
    'profile-switch',
    'reload',
  ])('fails %s without a delivered ACK and permits an idempotent retry', async (failure) => {
    const options = {
      title: 'Due',
      body: '',
      data: { notificationId: 'retry-card' },
    };
    const first = manager.dispatch(options);
    expect(manager.dispatch(options)).toBe(first);
    const toast = window();
    // Starting the initial navigation must not cancel its own delivery.
    toast.webContents.emit('did-start-loading');
    if (failure === 'send-failed') {
      vi.mocked(toast.webContents.send).mockImplementationOnce(() => {
        throw new Error('gone');
      });
      handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
        sender: toast.webContents,
      });
    } else if (failure === 'load-failed') {
      toast.webContents.emit('did-fail-load', {}, -2, 'failed', 'about:blank', true);
    } else if (failure === 'closed') toast.close();
    else if (failure === 'process-gone') toast.webContents.emit('render-process-gone');
    else if (failure === 'profile-switch') manager.clearPresentation();
    else if (failure === 'reload') {
      handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
        sender: toast.webContents,
      });
      toast.webContents.emit('did-start-loading');
    } else await vi.advanceTimersByTimeAsync(10_000);
    await expect(first).resolves.toBe(false);
    const retry = manager.dispatch(options);
    const next = window();
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
      sender: next.webContents,
    });
    handlers.get(NotificationChannels.CUSTOM_RESIZE)!({ sender: next.webContents }, 160);
    handlers.get(NotificationChannels.CUSTOM_PRESENTED)!(
      { sender: next.webContents },
      'retry-card',
    );
    await expect(retry).resolves.toBe(true);
    await expect(manager.dispatch(options)).resolves.toBe(true);
    expect(next.webContents.send).toHaveBeenCalledTimes(1);
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
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
      sender: toast.webContents,
    });
    expect(toast.webContents.send).toHaveBeenCalledTimes(expected);
    handlers.get(NotificationChannels.CUSTOM_RESIZE)!({ sender: toast.webContents }, 160);
    for (const [, notification] of vi.mocked(toast.webContents.send).mock.calls) {
      handlers.get(NotificationChannels.CUSTOM_PRESENTED)!(
        { sender: toast.webContents },
        notification.id,
      );
    }
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
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
      sender: main.webContents,
    });
    expect(toast.webContents.send).not.toHaveBeenCalled();
    handlers.get(NotificationChannels.CUSTOM_RENDERER_READY)!({
      sender: toast.webContents,
    });
    const payload = vi.mocked(toast.webContents.send).mock.calls[0]![1];
    handlers.get(NotificationChannels.CUSTOM_CLICK)!({ sender: toast.webContents }, payload.id, {
      target: 'untrusted',
    });
    expect(main.webContents.send).toHaveBeenCalledWith(RendererEventChannels.NOTIFICATION_CLICKED, {
      notificationId: 'n-1',
      target: 'trusted',
    });
    expect(main.isVisible()).toBe(true);
    manager.destroy();
    expect(toast.isDestroyed()).toBe(true);
    const count = BrowserWindow.getAllWindows().length;
    manager.dispatch({ title: 'After shutdown', body: '' });
    expect(BrowserWindow.getAllWindows()).toHaveLength(count);
  });
});
