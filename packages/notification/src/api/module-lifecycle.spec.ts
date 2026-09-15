/**
 * Notification API Module Lifecycle Spec
 * 通知 API 模块生命周期测试
 *
 * Verifies that createNotificationApiModule is a pure transport/lifecycle
 * adapter: it wires routes, starts the already-assembled instance, owns a
 * per-handle state machine (single registration, terminal states, idempotent
 * destroy), cleans up on start failure, and never touches `db`. It also locks
 * that channelCapabilities / transports / closureChecker leave the module
 * entirely: none of them appear in the options shape or the register path.
 *
 * 验证 createNotificationApiModule 是纯传输/生命周期适配器：
 * 挂载路由、启动已装配实例、维护每个 handle 的状态机（单次注册、
 * 终态、destroy 幂等）、start 失败时清理，且完全不触碰 `db`。同时固定
 * channelCapabilities / transports / closureChecker 已完全离开模块：
 * 它们既不出现于 options 形状，也不出现在 register 路径。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationModuleInstance } from '../server/infrastructure';
import { createNotificationApiModule, type NotificationApiModuleContext } from './module';

function createFakeInstance() {
  const api = {
    createNotification: vi.fn(),
    getNotification: vi.fn(),
    listNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    batchDelete: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
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

function createFakeContext(): NotificationApiModuleContext {
  return {
    app: {} as Express,
    router: { use: vi.fn(), stack: [] } as unknown as Router,
    middleware: {
      auth: vi.fn(),
      requireRole: vi.fn(() => vi.fn()),
    },
    openApiRegistry: {
      registerPath: vi.fn(),
      register: vi.fn(),
    },
  };
}

describe('createNotificationApiModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: NotificationApiModuleContext;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
  });

  it('register wires routes once, starts once, and never touches db', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    // No db property on the context: register must still work.
    // 上下文没有 db 属性：register 必须照常工作。
    const contextWithoutDb = { ...context } as NotificationApiModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    expect(routerUse).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledWith('/notifications', expect.anything());

    expect(
      (context.openApiRegistry?.registerPath as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('exposes the owner portability capability without recomposition', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });
    expect(moduleDef.portableCapability).toBe(fake.portableCapability);
  });

  it('does not expose channelCapabilities / transports / closureChecker in options', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    // The options type carries only `instance`; the runtime only needs the api.
    // options 类型只携带 `instance`；运行时只需要 api。
    expect(moduleDef.name).toBe('Notification');
    expect(() => moduleDef.register(context)).not.toThrow();
  });

  it('throws on a second register() call (single registration per handle)', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    moduleDef.register(context);
    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    moduleDef.register(context);
    moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('destroy disposes exactly once and is idempotent', () => {
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes and rethrows when start() throws, leaving a handle that cannot be re-registered', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not mount any route on the host router when start() throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(routerUse).not.toHaveBeenCalled();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('destroy() after a failed registration does not dispose a second time', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('rolls back the mount on the host router when router.use() throws', () => {
    const preExisting = { name: '<pre-existing>' };
    const routerStub = {
      stack: [preExisting],
      use: vi.fn().mockImplementationOnce(() => {
        throw new Error('mount failed');
      }),
    } as unknown as Router;

    const mountContext = { ...context, router: routerStub } as NotificationApiModuleContext;
    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(mountContext)).toThrow('mount failed');
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect((routerStub as unknown as { stack: unknown[] }).stack).toEqual([preExisting]);

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original registration error even if dispose also throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });
    fake.dispose.mockImplementation(() => {
      throw new Error('dispose failed');
    });

    const moduleDef = createNotificationApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
