/**
 * Goal API Module Lifecycle Spec
 * 目标 API 模块生命周期测试
 *
 * Verifies that createGoalApiModule is a pure transport/lifecycle adapter:
 * it wires routes, starts the already-assembled instance, owns a per-handle
 * state machine (single registration, terminal states, idempotent destroy),
 * cleans up on start failure, and never touches `db`.
 *
 * 验证 createGoalApiModule 是纯传输/生命周期适配器：
 * 挂载路由、启动已装配实例、维护每个 handle 的状态机（单次注册、
 * 终态、destroy 幂等）、start 失败时清理，且完全不触碰 `db`。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalApplicationPort } from '../server/application';
import type { GoalModuleInstance } from '../server/infrastructure';
import { createGoalApiModule, type GoalApiModuleContext } from './module';

function createApiStub(): GoalApplicationPort {
  return {
    createGoal: vi.fn(),
    getGoal: vi.fn(),
    listGoals: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    permanentlyDeleteGoal: vi.fn(),
    archiveGoal: vi.fn(),
    archiveExpiredGoals: vi.fn(),
    activateGoal: vi.fn(),
    completeGoal: vi.fn(),
    searchGoals: vi.fn(),
    addKeyResult: vi.fn(),
    updateKeyResult: vi.fn(),
    updateKeyResultProgress: vi.fn(),
    deleteKeyResult: vi.fn(),
    addReview: vi.fn(),
    listReviews: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(),
    createRecord: vi.fn(),
    listRecords: vi.fn(),
    deleteRecord: vi.fn(),
    getGoalAggregate: vi.fn(),
    cloneGoal: vi.fn(),
    batchUpdateKeyResultWeights: vi.fn(),
  } as GoalApplicationPort;
}

/**
 * Fake GoalModuleInstance that also models a runtime event bus:
 * `publish` only records events while the runtime is running. This lets the
 * spec assert that after `dispose()` the runtime no longer receives events.
 *
 * 模拟 GoalModuleInstance，同时建模运行时事件总线：
 * 仅当 runtime 处于运行状态时 `publish` 才记录事件，
 * 从而断言 `dispose()` 之后运行时不再收到事件。
 */
function createFakeInstance() {
  const receivedEvents: string[] = [];
  let running = false;

  const start = vi.fn(() => {
    running = true;
  });
  const dispose = vi.fn(() => {
    running = false;
  });

  const instance: GoalModuleInstance = {
    api: createApiStub(),
    start,
    dispose,
  } as GoalModuleInstance;

  return {
    instance,
    start,
    dispose,
    receivedEvents,
    publish(event: string) {
      if (running) {
        receivedEvents.push(event);
      }
    },
  };
}

function createFakeContext(): GoalApiModuleContext {
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

describe('createGoalApiModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: GoalApiModuleContext;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
  });

  it('register wires routes once, starts once, and never touches db', () => {
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    // No db property on the context: register must still work.
    // 上下文没有 db 属性：register 必须照常工作。
    const contextWithoutDb = { ...context } as GoalApiModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();

    // vNext exposes one canonical Goal route group; Folder is retired.
    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    expect(routerUse).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledWith('/goals', expect.anything());

    // The fake api was consumed by route building.
    // 路由构建消费了 fake api。
    expect(
      (context.openApiRegistry?.registerPath as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', () => {
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    moduleDef.register(context);
    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', () => {
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    moduleDef.register(context);
    moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('destroy disposes exactly once and is idempotent', () => {
    const moduleDef = createGoalApiModule({ instance: fake.instance });

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

    const moduleDef = createGoalApiModule({ instance: fake.instance });

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
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(routerUse).not.toHaveBeenCalled();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('destroy() after a failed registration does not dispose a second time', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createGoalApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes and rethrows when the canonical /goals mount fails', () => {
    const mountContext = createFakeContext();
    const routerUse = mountContext.router.use as ReturnType<typeof vi.fn>;
    routerUse.mockImplementationOnce(() => {
      throw new Error('mount failed');
    });
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(mountContext)).toThrow('mount failed');
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original registration error even if dispose also throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });
    fake.dispose.mockImplementation(() => {
      throw new Error('dispose failed');
    });

    const moduleDef = createGoalApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('stops the runtime event handler after dispose', () => {
    const moduleDef = createGoalApiModule({ instance: fake.instance });

    moduleDef.register(context);
    fake.publish('goal.updated');
    expect(fake.receivedEvents).toEqual(['goal.updated']);

    moduleDef.destroy?.();
    fake.publish('goal.archived');
    expect(fake.receivedEvents).toEqual(['goal.updated']);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
