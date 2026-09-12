/**
 * Task API composition root spec.
 * 任务 API 组合根测试。
 *
 * Verifies composeTask():
 * - assembles task in the mandated plan §3.1 order
 *   (repositories → createTaskRuntimeContribution → conditional outbox runtime →
 *   module instance → API module)
 * - enables the outbox runtime only when goalProgressHandler is provided
 * - returns an already-bound IApiModule-compatible handle
 * - mounts task routes and starts the owned instance when registered
 *
 * 验证 composeTask()：
 * - 按计划 §3.1 顺序装配任务（repositories → createTaskRuntimeContribution →
 *   条件性 outbox runtime → module instance → API module）
 * - 仅当提供 goalProgressHandler 时启用 outbox runtime
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载任务路由并启动所属实例
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
import type { TaskApiModuleContext } from '@memoflow/task/api';
import type { TaskGoalProgressHandler } from '@memoflow/goal';
import type { TaskRuntimeContributionsInput } from '@memoflow/task';

vi.mock('@memoflow/task', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/task')>();
  return {
    ...actual,
    createTaskModule: vi.fn(actual.createTaskModule),
    createTaskPrismaGoalOutboxRuntime: vi.fn(actual.createTaskPrismaGoalOutboxRuntime),
    createTaskPrismaRepositories: vi.fn(actual.createTaskPrismaRepositories),
    createTaskRuntimeContribution: vi.fn(actual.createTaskRuntimeContribution),
  };
});

vi.mock('@memoflow/task/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/task/api')>();
  return {
    ...actual,
    createTaskApiModule: vi.fn(actual.createTaskApiModule),
  };
});

import { composeTask } from './compose-task';
import {
  createTaskModule,
  createTaskPrismaGoalOutboxRuntime,
  createTaskPrismaRepositories,
  createTaskRuntimeContribution,
} from '@memoflow/task';
import { createTaskApiModule } from '@memoflow/task/api';

const fakeDb = {} as unknown as PrismaClient;
const hostRuntime: TaskRuntimeContributionsInput = {
  start: async () => {},
  stop: async () => {},
};
const goalProgressHandler: TaskGoalProgressHandler = {
  handle: async () => {},
};

describe('composeTask assembly order with goalProgressHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles: repositories → task runtime → outbox runtime → module → api module', () => {
    composeTask({ db: fakeDb, goalProgressHandler });

    const reposOrder = createTaskPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createTaskRuntimeContribution.mock.invocationCallOrder[0];
    const outboxOrder = createTaskPrismaGoalOutboxRuntime.mock.invocationCallOrder[0];
    const moduleOrder = createTaskModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createTaskApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(outboxOrder);
    expect(outboxOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db, repos, and a dispatcher-backed outbox runtime into the module', () => {
    composeTask({ db: fakeDb, goalProgressHandler });

    expect(createTaskPrismaRepositories).toHaveBeenCalledWith(fakeDb);
    expect(createTaskPrismaGoalOutboxRuntime).toHaveBeenCalledWith(
      fakeDb,
      goalProgressHandler,
    );

    const repoSet = createTaskPrismaRepositories.mock.results[0].value;
    const moduleCall = createTaskModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      taskPlanRepository: repoSet.taskPlanRepository,
      taskOccurrenceRepository: repoSet.taskOccurrenceRepository,
      taskWriteTransactionRunner: repoSet.taskWriteTransactionRunner,
    });
    expect(moduleCall.runtimeContributions).toContain(
      createTaskRuntimeContribution.mock.results[0].value,
    );
    expect(moduleCall.runtimeContributions).toContain(
      createTaskPrismaGoalOutboxRuntime.mock.results[0].value,
    );

    const instance = createTaskModule.mock.results[0].value;
    expect(createTaskApiModule).toHaveBeenCalledWith({ instance });
  });

  it('appends host runtime contributions after the outbox runtime', () => {
    composeTask({ db: fakeDb, goalProgressHandler, runtimeContributions: hostRuntime });

    const moduleCall = createTaskModule.mock.calls[0][0];
    const contributions = moduleCall.runtimeContributions as unknown[];
    expect(contributions).toContain(hostRuntime);
    const outboxIndex = contributions.indexOf(
      createTaskPrismaGoalOutboxRuntime.mock.results[0].value,
    );
    const hostIndex = contributions.indexOf(hostRuntime);
    expect(outboxIndex).toBeGreaterThanOrEqual(0);
    expect(hostIndex).toBeGreaterThan(outboxIndex);
  });
});

describe('composeTask assembly without goalProgressHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not create the outbox runtime and still assembles repositories → runtime → module → api module', () => {
    composeTask({ db: fakeDb });

    expect(createTaskPrismaGoalOutboxRuntime).not.toHaveBeenCalled();

    const reposOrder = createTaskPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createTaskRuntimeContribution.mock.invocationCallOrder[0];
    const moduleOrder = createTaskModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createTaskApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);

    const moduleCall = createTaskModule.mock.calls[0][0];
    expect(moduleCall.runtimeContributions).toContain(
      createTaskRuntimeContribution.mock.results[0].value,
    );
    expect(moduleCall.runtimeContributions).not.toContain(
      createTaskPrismaGoalOutboxRuntime.mock.results[0],
    );

    const instance = createTaskModule.mock.results[0].value;
    expect(createTaskApiModule).toHaveBeenCalledWith({ instance });
  });

  it('returns a module handle with name Task plus register and destroy, and the same instance.api as applicationPort', () => {
    const composed = composeTask({ db: fakeDb });

    expect(composed.module).toMatchObject({ name: 'Task' });
    expect(typeof composed.module.register).toBe('function');
    expect(typeof composed.module.destroy).toBe('function');

    const instance = createTaskModule.mock.results[0].value;
    expect(composed.applicationPort).toBe(instance.api);
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: Prisma repositories only hold the db reference at construction
 * (no queries), and the module-owned runtimes (maintenance, event, outbox)
 * tolerate a fake db at start (their pollers swallow db errors and are
 * timer-unref'd), so registering with a fake db succeeds.
 *
 * 真实工厂下：Prisma repository 构造时只持有 db 引用（无查询），
 * 模块自有 runtime（maintenance/event/outbox）在 start 时容忍 fake db
 * （轮询器吞掉 db 错误且 timer 已 unref），因此用 fake db 注册可成功。
 */
describe('composeTask structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts task routes on the router and starts the owned instance', async () => {
    const composed = composeTask({ db: fakeDb });

    const instance = createTaskModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: TaskApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    await expect(composed.module.register(context)).resolves.toBeUndefined();
    expect(routerUse).toHaveBeenCalledWith(expect.anything());
    expect(startSpy).toHaveBeenCalledTimes(1);

    await composed.module.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
