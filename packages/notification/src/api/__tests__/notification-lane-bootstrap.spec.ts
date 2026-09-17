import { describe, expect, it, vi } from 'vitest';
import { Router } from 'express';
import { createNotificationApiModule } from '../module';
import type { NotificationModuleInstance } from '../../server/infrastructure';

/**
 * Notification lane-ownership bootstrap spec (P0-1, post-Step-B shape).
 *
 * Channel capability / closureChecker / transport selection has left the
 * transport module entirely and now lives in the host composer (Step C). This
 * spec locks that the API factory is instance-bound: it requires
 * `options.instance`, never reads closureChecker/capabilities from options or
 * context, and registration succeeds with no capability config at all.
 *
 * 通知 lane 归属 bootstrap 测试（P0-1，Step B 之后形状）。
 *
 * channel capability / closureChecker / transport 选择已完全离开传输模块，
 * 现在归属宿主 composer（Step C）。本测试固定 API 工厂为实例绑定：要求
 * `options.instance`，绝不从 options/context 读取 closureChecker/capabilities，
 * 且不携带任何 capability 配置即可注册成功。
 */
describe('Notification Module Lane Ownership Bootstrap (P0-1)', () => {
  function createFakeInstance(): NotificationModuleInstance {
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
    return {
      notificationRepository: {} as never,
      preferenceRepository: {} as never,
      useCases: {} as never,
      api,
      durableRuntime: {} as never,
      start: vi.fn(),
      dispose: vi.fn(),
    } as unknown as NotificationModuleInstance;
  }

  function createMockContext(overrides: Record<string, unknown> = {}) {
    const router = Router();
    const middleware = {
      auth: vi.fn(),
      requireRole: vi.fn(() => vi.fn()),
    } as never;

    return {
      app: {} as never,
      router,
      middleware,
      openApiRegistry: { registerPath: vi.fn(), register: vi.fn() } as never,
      ...overrides,
    };
  }

  it('1. registration requires an assembled instance (no capability config needed)', () => {
    const laneModule = createNotificationApiModule({ instance: createFakeInstance() });
    const context = createMockContext();
    expect(() => laneModule.register(context as never)).not.toThrow();
  });

  it('2. registration succeeds even when context carries closureChecker (ignored by transport)', () => {
    // The context may still carry db/closureChecker from the shared bootstrapper,
    // but the transport must ignore them for assembly.
    const laneModule = createNotificationApiModule({ instance: createFakeInstance() });
    const context = createMockContext({
      db: {} as never,
      closureChecker: async () => false,
    });
    expect(() => laneModule.register(context as never)).not.toThrow();
  });

  it('3. registration succeeds without any channelCapabilities/transports in options', () => {
    const laneModule = createNotificationApiModule({ instance: createFakeInstance() });
    const context = createMockContext();
    expect(() => laneModule.register(context as never)).not.toThrow();
  });

  it('4. factory fails closed when options.instance is missing', () => {
    expect(() =>
      createNotificationApiModule({ instance: undefined as never }),
    ).toThrow('[FAIL-CLOSED] createNotificationApiModule requires options.instance');
  });
});
