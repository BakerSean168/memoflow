/**
 * Task API Module Lifecycle Spec
 * 任务 API 模块生命周期测试
 *
 * Verifies that createTaskApiModule is a pure transport/lifecycle adapter:
 * it wires routes, AWAITS the already-assembled instance start, owns a
 * per-handle state machine (single registration, terminal states, idempotent
 * destroy), cleans up on start failure, and never touches `db`.
 *
 * 验证 createTaskApiModule 是纯传输/生命周期适配器：
 * 挂载路由、await 启动已装配实例、维护每个 handle 的状态机（单次注册、
 * 终态、destroy 幂等）、start 失败时清理，且完全不触碰 `db`。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskApplicationPort } from '../server/application';
import type { TaskModuleInstance } from '../server/infrastructure';
import { createTaskApiModule, type TaskApiModuleContext } from './module';

function createApiStub(): TaskApplicationPort {
  const noop = vi.fn();
  return {
    createTaskPlan: noop,
    updateTaskPlan: noop,
    activateTaskPlan: noop,
    pauseTaskPlan: noop,
    archiveTaskPlan: noop,
    deleteTaskPlan: noop,
    generateTaskOccurrences: noop,
    bindTaskToGoal: noop,
    unbindTaskFromGoal: noop,
    getTaskPlan: noop,
    listTaskPlans: noop,
    completeTaskOccurrence: noop,
    uncompleteTaskOccurrence: noop,
    skipTaskOccurrence: noop,
    startTaskOccurrence: noop,
    deleteTaskOccurrence: noop,
    markTaskOccurrenceMissed: noop,
    getTaskOccurrence: noop,
    listTaskOccurrencesByAccount: noop,
    listTaskOccurrencesByTemplate: noop,
    listTaskOccurrencesByStatus: noop,
    getTaskOccurrencesByDateRange: noop,
  } as TaskApplicationPort;
}

/**
 * Fake TaskModuleInstance with an async start/dispose lifecycle (matches the
 * real deep module which returns promises for both).
 *
 * 模拟 TaskModuleInstance，start/dispose 为 async 生命周期
 * （与真实 deep module 返回 Promise 的行为一致）。
 */
function createFakeInstance() {
  const start = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});

  const instance: TaskModuleInstance = {
    api: createApiStub(),
    start,
    dispose,
  } as TaskModuleInstance;

  return { instance, start, dispose };
}

function createFakeContext(): TaskApiModuleContext {
  return {
    app: {} as Express,
    router: { use: vi.fn() } as unknown as Router,
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

describe('createTaskApiModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: TaskApiModuleContext;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
  });

  it('register wires routes once, awaits start once, and never touches db', async () => {
    const moduleDef = createTaskApiModule({ instance: fake.instance });

    // No db property on the context: register must still work.
    // 上下文没有 db 属性：register 必须照常工作。
    const contextWithoutDb = { ...context } as TaskApiModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    await expect(moduleDef.register(contextWithoutDb)).resolves.toBeUndefined();

    // The single combined task router was mounted once (registerTaskRoutes
    // itself fixes the /task-plans, /task-occurrences, /tasks prefixes).
    // 组合后的 task router 被挂载一次（registerTaskRoutes 内部固定了
    // /task-plans、/task-occurrences、/tasks 前缀）。
    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    expect(routerUse).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledWith(expect.anything());

    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', async () => {
    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await moduleDef.register(context);
    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', async () => {
    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await moduleDef.register(context);
    await moduleDef.destroy?.();

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
  });

  it('destroy disposes exactly once and is idempotent', async () => {
    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await moduleDef.destroy?.();
    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes and rethrows when start() rejects, leaving a handle that cannot be re-registered', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));

    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not mount the combined task router when start() rejects', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(routerUse).not.toHaveBeenCalled();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('destroy() after a failed registration does not dispose a second time', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));

    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original registration error even if dispose also rejects', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));
    fake.dispose.mockRejectedValue(new Error('dispose failed'));

    const moduleDef = createTaskApiModule({ instance: fake.instance });

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
