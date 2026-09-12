/**
 * Notification API composition root spec.
 * 通知 API 组合根测试。
 *
 * Verifies composeNotification():
 * - assembles notification in the mandated plan §3.3 order
 *   (repository set → durable runtime → module instance → API module)
 * - passes the host closureChecker and channel capabilities through unchanged
 * - exposes the durable NotificationRequested writer for business handlers
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /notifications and starts the owned instance when registered
 *
 * 验证 composeNotification()：
 * - 按计划 §3.3 顺序装配通知（仓储集合 → durable runtime → module instance → API module）
 * - 原样透传宿主 closureChecker 与 channel capabilities
 * - 暴露业务 handler 使用的 durable NotificationRequested writer
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /notifications 并启动所属实例
 *
 * The ingredient factories are wrapped in vi.fn() so the spec can assert assembly
 * order, while delegating to the real implementations so the structural
 * registration test runs against genuine factories with a fake db.
 *
 * ingredient 工厂被包成 vi.fn() 以便断言装配顺序，同时委托真实实现，
 * 使结构注册测试用真实工厂 + fake db 运行。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { NotificationApiModuleContext } from '@memoflow/notification/api';
import type { ChannelCapabilitySpec } from '@memoflow/notification';
import type { UserTimeContextPort } from '@memoflow/time';

vi.mock('@memoflow/notification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/notification')>();
  return {
    ...actual,
    createNotificationDurableRuntime: vi.fn(actual.createNotificationDurableRuntime),
    createNotificationModule: vi.fn(actual.createNotificationModule),
    createNotificationPrismaRepositories: vi.fn(actual.createNotificationPrismaRepositories),
  };
});

vi.mock('@memoflow/notification/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/notification/api')>();
  return {
    ...actual,
    createNotificationApiModule: vi.fn(actual.createNotificationApiModule),
  };
});

import { composeNotification } from './compose-notification';
import {
  createNotificationDurableRuntime,
  createNotificationModule,
  createNotificationPrismaRepositories,
} from '@memoflow/notification';
import { createNotificationApiModule } from '@memoflow/notification/api';

const fakeDb = {} as unknown as PrismaClient;
const closureChecker = async (_identityId: string): Promise<boolean> => false;
const channelCapabilities: readonly ChannelCapabilitySpec[] = [
  { channelType: 'InApp', status: 'available', requiredInProduction: true },
];
const userTimeContextPort: UserTimeContextPort = {
  getUserTimeContext: async () => ({ timeZone: 'UTC', weekStartsOn: 1 }),
};

describe('composeNotification assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.3 order: repositories → durable runtime → module → api module', () => {
    composeNotification({
      db: fakeDb,
      closureChecker,
      userTimeContextPort,
      channelCapabilities,
    });

    const reposOrder = createNotificationPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createNotificationDurableRuntime.mock.invocationCallOrder[0];
    const moduleOrder = createNotificationModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createNotificationApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db, host closureChecker and channel capabilities through unchanged', () => {
    composeNotification({
      db: fakeDb,
      closureChecker,
      userTimeContextPort,
      channelCapabilities,
    });

    expect(createNotificationPrismaRepositories).toHaveBeenCalledWith(fakeDb);

    const repoSet = createNotificationPrismaRepositories.mock.results[0].value;
    expect(createNotificationDurableRuntime).toHaveBeenCalledWith({
      notificationRepository: repoSet.notificationRepository,
      preferenceRepository: repoSet.notificationPreferenceRepository,
      closureChecker,
      userTimeContextPort,
      reliableAdapter: repoSet.reliableAdapter,
      channelCapabilities: Array.from(channelCapabilities),
    });

    const moduleCall = createNotificationModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      notificationRepository: repoSet.notificationRepository,
      preferenceRepository: repoSet.notificationPreferenceRepository,
      templateRepository: repoSet.notificationTemplateRepository,
      closureChecker,
      userTimeContextPort,
      durableRuntime: createNotificationDurableRuntime.mock.results[0].value,
      auditRepository: repoSet.auditRepository,
    });
    expect(moduleCall.runtimeContributions).toContain(
      createNotificationDurableRuntime.mock.results[0].value,
    );

    const instance = createNotificationModule.mock.results[0].value;
    expect(createNotificationApiModule).toHaveBeenCalledWith({ instance });
  });

  it('exposes the SAME durable NotificationRequested writer from the repository set', () => {
    const composed = composeNotification({ db: fakeDb, closureChecker, userTimeContextPort, channelCapabilities });
    const repoSet = createNotificationPrismaRepositories.mock.results[0].value;
    expect(composed.requestedWriter).toBe(repoSet.requestedWriter);
    expect(composed.repositories.requestedWriter).toBe(repoSet.requestedWriter);
  });

  it('returns the instance-bound repository view (ComposedNotificationApi shape)', () => {
    const composed = composeNotification({
      db: fakeDb,
      closureChecker,
      userTimeContextPort,
      channelCapabilities,
    });

    const repoSet = createNotificationPrismaRepositories.mock.results[0].value;
    expect(composed.repositories.notificationRepository).toBe(repoSet.notificationRepository);
  });

  it('returns a module handle with name Notification plus register and destroy', () => {
    const composed = composeNotification({
      db: fakeDb,
      closureChecker,
      userTimeContextPort,
      channelCapabilities,
    });

    expect(composed.module).toMatchObject({ name: 'Notification' });
    expect(typeof composed.module.register).toBe('function');
    expect(typeof composed.module.destroy).toBe('function');
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the notification Prisma repositories and audit repository only
 * hold the db reference at construction, the durable runtime starts a timer that
 * swallows db errors (timer is unref'd), so registering with a fake db succeeds
 * and mounts /notifications.
 *
 * 真实工厂下：通知 Prisma 仓储与审计仓储构造时只持有 db 引用（无查询），durable
 * runtime 启动的定时器会吞掉 db 错误（timer 已 unref），因此用 fake db 注册可成功
 * 并挂载 /notifications。
 */
describe('composeNotification structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /notifications on the router and starts the owned instance', () => {
    const composed = composeNotification({
      db: fakeDb,
      closureChecker,
      userTimeContextPort,
      channelCapabilities,
    });

    const instance = createNotificationModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: NotificationApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => composed.module.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/notifications', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    composed.module.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
