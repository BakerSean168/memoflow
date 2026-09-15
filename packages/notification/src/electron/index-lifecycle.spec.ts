/**
 * Notification Electron IPC Lifecycle Spec
 * 通知 Electron IPC 生命周期测试
 *
 * Verifies that createNotificationElectronModule is a pure transport/lifecycle
 * adapter: it registers all core notification channels, starts the
 * already-assembled instance once, routes IPC calls through
 * NotificationController to the same instance api, removes the core channels on
 * destroy, disposes exactly once, and cleans up on start failure. It also locks
 * the per-handle state machine (double register() throws, register-after-destroy
 * throws, failed registration reverses exactly the channels installed by that
 * call) and the custom-renderer channel ownership rule: the desktop
 * custom-notification.manager owns CUSTOM_* channels, so this handle must never
 * install or remove them.
 *
 * 验证 createNotificationElectronModule 是纯传输/生命周期适配器：
 * 注册全部核心通知通道、启动已装配实例一次、通过 NotificationController 把
 * IPC 调用路由到同一实例 api、destroy 时移除核心通道、恰好 dispose 一次，且
 * start 失败时执行清理。同时固定每个 handle 的状态机（重复 register() 抛错、
 * destroy 后 register() 抛错、失败注册会逆向移除本次已安装的通道）与
 * custom-renderer 通道归属规则：CUSTOM_* 通道归属桌面
 * custom-notification.manager，本 handle 绝不安装或移除它们。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { NotificationModuleInstance } from '../server/infrastructure';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    if (handlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    }
    handlers.set(channel, handler);
  });
  const removeHandler = vi.fn((channel: string) => {
    handlers.delete(channel);
  });
  return {
    handlers,
    handle,
    removeHandler,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    removeHandler: mocks.removeHandler,
  },
}));

import { createNotificationElectronModule, notificationCustomRendererChannels } from './index';

const coreChannels = [
  NotificationChannels.LIST,
  NotificationChannels.GET,
  NotificationChannels.CREATE,
  NotificationChannels.MARK_READ,
  NotificationChannels.MARK_ALL_READ,
  NotificationChannels.DELETE,
  NotificationChannels.CLEAR_ALL,
  NotificationChannels.GET_UNREAD_COUNT,
  NotificationChannels.PREFERENCES_GET,
  NotificationChannels.PREFERENCES_UPDATE,
];

function createFakeInstance() {
  const api = {
    createNotification: vi.fn(() => ok(null as never)),
    getNotification: vi.fn(() => ok(null as never)),
    listNotifications: vi.fn(() => ok([] as never)),
    markAsRead: vi.fn(() => ok(null as never)),
    markAllAsRead: vi.fn(() => ok(null as never)),
    deleteNotification: vi.fn(() => ok(null as never)),
    batchDelete: vi.fn(() => ok(null as never)),
    getUnreadCount: vi.fn(() => ok(null as never)),
    getPreferences: vi.fn(() => ok(null as never)),
    updatePreferences: vi.fn(() => ok(null as never)),
  };
  const portableCapability = {
    key: 'notification-delivery-preferences',
    schemaVersion: 3,
  } as never;
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: NotificationModuleInstance = {
    notificationRepository: {} as never,
    preferenceRepository: {} as never,
    portableCapability,
    templateRepository: {} as never,
    useCases: {} as never,
    api,
    durableRuntime: {} as never,
    start,
    dispose,
  } as NotificationModuleInstance;
  return { instance, api, portableCapability, start, dispose };
}

function createFakeContext(): IElectronModuleContext {
  return {
    db: {},
    auth: {
      requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }),
    },
  } as unknown as IElectronModuleContext;
}

function registered(channel: string) {
  const handler = mocks.handlers.get(channel);
  expect(handler, `Expected ${channel} to be registered`).toBeDefined();
  return handler!;
}

describe('createNotificationElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createNotificationElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createNotificationElectronModule({ instance: fake.instance });
  });

  afterEach(() => {
    try {
      moduleDef.destroy?.();
    } catch {
      // destroy() may propagate a dispose error by design; don't leak it into unrelated tests.
    }
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it('registers all core channels, starts the instance once, and never touches custom channels', () => {
    moduleDef.register(context);

    for (const channel of coreChannels) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(coreChannels.length);
    // Custom-renderer channels are owned by the desktop manager: this handle
    // must never install them.
    // custom-renderer 通道归属桌面 manager：本 handle 绝不安装它们。
    for (const channel of notificationCustomRendererChannels) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', () => {
    moduleDef.register(context);

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', () => {
    moduleDef.register(context);
    moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('routes IPC calls through the controller to the same instance api', async () => {
    fake.api.listNotifications.mockResolvedValue(ok([] as never));
    moduleDef.register(context);

    const listResult = await registered(NotificationChannels.LIST)(undefined, {});
    expect(listResult).toMatchObject({ ok: true });
    expect(fake.api.listNotifications).toHaveBeenCalledTimes(1);
  });

  it('destroy removes only the core channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    // Simulate a pre-existing custom channel handler owned by the desktop
    // manager: destroy must leave it installed.
    // 模拟一个由桌面 manager 安装的既有 custom 通道 handler：
    // destroy 必须保留它。
    const customHandler = vi.fn();
    mocks.handlers.set(NotificationChannels.CUSTOM_RECEIVE, customHandler);

    moduleDef.destroy?.();
    for (const channel of coreChannels) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.handlers.has(NotificationChannels.CUSTOM_RECEIVE)).toBe(true);
    expect(mocks.removeHandler).toHaveBeenCalledTimes(coreChannels.length);
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes, removes all core channels, and rethrows when start() throws, leaving a handle that cannot be re-registered', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the channels installed before ipcMain.handle() throws mid-registration', () => {
    mocks.handle
      .mockImplementationOnce((channel: string, handler: (...args: unknown[]) => unknown) => {
        mocks.handlers.set(channel, handler);
      })
      .mockImplementationOnce((channel: string, handler: (...args: unknown[]) => unknown) => {
        mocks.handlers.set(channel, handler);
      })
      .mockImplementationOnce((channel: string) => {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      });

    expect(() => moduleDef.register(context)).toThrow('second handler');

    expect(mocks.handlers.size).toBe(0);
    expect(mocks.removeHandler).toHaveBeenCalledWith(coreChannels[0]);
    expect(mocks.removeHandler).toHaveBeenCalledWith(coreChannels[1]);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      coreChannels[1],
      coreChannels[0],
    ]);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.start).not.toHaveBeenCalled();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('rethrows the original registration error even if dispose also throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });
    fake.dispose.mockImplementation(() => {
      throw new Error('dispose failed');
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
  });

  it('destroy() after a failed registration neither disposes again nor re-removes channels', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
    const removeHandlerCallsAfterFailedRegister = mocks.removeHandler.mock.calls.length;

    moduleDef.destroy?.();

    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.removeHandler.mock.calls.length).toBe(removeHandlerCallsAfterFailedRegister);
  });

  it('register works with a context that has no db property (no db read for assembly)', () => {
    const contextWithoutDb = { ...context } as IElectronModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();
    expect(fake.start).toHaveBeenCalledTimes(1);
  });
});
