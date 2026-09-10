/**
 * Goal API composition root spec.
 * 目标 API 组合根测试。
 *
 * Verifies composeGoal():
 * - assembles goal in the mandated plan §3.1 order
 *   (repositories → listeners runtime → base runtime contribution → module instance → API module)
 * - passes the host taskBindingReadPort through and includes the listener
 *   runtime inside the module runtime contributions
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /goals and starts the owned instance when registered
 *
 * 验证 composeGoal()：
 * - 按计划 §3.1 顺序装配目标（repositories → listeners runtime → 基础 runtime 贡献 →
 *   module instance → API module）
 * - 透传宿主 taskBindingReadPort，并把 listener runtime 并入模块运行时贡献
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /goals 并启动所属实例
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
import type { GoalApiModuleContext } from '@memoflow/goal/api';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { GoalRuntimeContributionsInput } from '@memoflow/goal';
import type { UserTimeContextPort } from '@memoflow/time';

vi.mock('@memoflow/goal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/goal')>();
  return {
    ...actual,
    createGoalEventListenersRuntime: vi.fn(actual.createGoalEventListenersRuntime),
    createGoalModule: vi.fn(actual.createGoalModule),
    createGoalPrismaRepositories: vi.fn(actual.createGoalPrismaRepositories),
    createGoalRuntimeContribution: vi.fn(actual.createGoalRuntimeContribution),
  };
});

vi.mock('@memoflow/goal/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/goal/api')>();
  return {
    ...actual,
    createGoalApiModule: vi.fn(actual.createGoalApiModule),
  };
});

import { composeGoal } from './compose-goal';
import {
  createGoalEventListenersRuntime,
  createGoalModule,
  createGoalPrismaRepositories,
  createGoalRuntimeContribution,
} from '@memoflow/goal';
import { createGoalApiModule } from '@memoflow/goal/api';

const fakeDb = {} as unknown as PrismaClient;
const fakeReadPort = {} as unknown as GoalDependencyReadPort;
const fakeTimeContextPort = {} as unknown as UserTimeContextPort;
const hostRuntime: GoalRuntimeContributionsInput = { start: () => {}, stop: () => {} };

describe('composeGoal assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.1 order: repositories → listeners → base runtime → module → api module', () => {
    composeGoal({ db: fakeDb, taskBindingReadPort: fakeReadPort, userTimeContextPort: fakeTimeContextPort });

    const reposOrder = createGoalPrismaRepositories.mock.invocationCallOrder[0];
    const listenersOrder = createGoalEventListenersRuntime.mock.invocationCallOrder[0];
    const runtimeOrder = createGoalRuntimeContribution.mock.invocationCallOrder[0];
    const moduleOrder = createGoalModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createGoalApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(listenersOrder);
    expect(listenersOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db, the read port through, and the listener runtime into the module runtime contributions', () => {
    composeGoal({
      db: fakeDb,
      taskBindingReadPort: fakeReadPort,
      userTimeContextPort: fakeTimeContextPort,
      runtimeContributions: hostRuntime,
    });

    expect(createGoalPrismaRepositories).toHaveBeenCalledWith(fakeDb);

    const repoSet = createGoalPrismaRepositories.mock.results[0].value;
    expect(createGoalEventListenersRuntime).toHaveBeenCalledWith({
      goalRepository: repoSet.goalRepository,
      goalRecordRepository: repoSet.goalRecordRepository,
      goalWriteTransactionRunner: repoSet.goalWriteTransactionRunner,
    });

    const moduleCall = createGoalModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      goalRepository: repoSet.goalRepository,
      goalRecordRepository: repoSet.goalRecordRepository,
      goalWriteTransactionRunner: repoSet.goalWriteTransactionRunner,
      habitRepository: repoSet.habitRepository,
      relationRepository: repoSet.relationRepository,
      walletRepository: repoSet.walletRepository,
      taskBindingReadPort: fakeReadPort,
      userTimeContextPort: fakeTimeContextPort,
    });
    expect(moduleCall.runtimeContributions).toContain(
      createGoalEventListenersRuntime.mock.results[0].value,
    );
    expect(moduleCall.runtimeContributions).toContain(
      createGoalRuntimeContribution.mock.results[0].value,
    );
    expect(moduleCall.runtimeContributions).toContain(hostRuntime);

    const instance = createGoalModule.mock.results[0].value;
    expect(createGoalApiModule).toHaveBeenCalledWith({ instance });
  });

  it('returns a module handle with name Goal plus register and destroy, and the same instance.api as applicationPort', () => {
    const composed = composeGoal({ db: fakeDb, taskBindingReadPort: fakeReadPort, userTimeContextPort: fakeTimeContextPort });

    expect(composed.module).toMatchObject({ name: 'Goal' });
    expect(typeof composed.module.register).toBe('function');
    expect(typeof composed.module.destroy).toBe('function');

    const instance = createGoalModule.mock.results[0].value;
    expect(composed.applicationPort).toBe(instance.api);
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: Prisma repositories only hold the db reference at construction
 * (no queries), the listener/base runtimes are logging-only, so registering with
 * a fake db succeeds and mounts /goals.
 *
 * 真实工厂下：Prisma repository 构造时只持有 db 引用（无查询），
 * listener/base runtime 仅记录日志，因此用 fake db 注册可成功并挂载
 * /goals。
 */
describe('composeGoal structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /goals on the router and starts the owned instance', () => {
    const composed = composeGoal({ db: fakeDb, taskBindingReadPort: fakeReadPort, userTimeContextPort: fakeTimeContextPort });

    const instance = createGoalModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: GoalApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => composed.module.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/goals', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    composed.module.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
