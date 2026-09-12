/**
 * Task Electron IPC Lifecycle Spec
 * 任务 Electron IPC 生命周期测试
 *
 * Verifies that createTaskElectronModule is a pure transport/lifecycle
 * adapter: it registers all task channels, AWAITS the already-assembled
 * instance start, routes IPC calls through Task controllers to the same
 * instance api, removes all channels on destroy, disposes exactly once, and
 * cleans up on start failure. It also locks the per-handle state machine:
 * double register() throws, register-after-destroy throws, and a failed
 * registration reverses exactly the channels installed by that call.
 *
 * 验证 createTaskElectronModule 是纯传输/生命周期适配器：
 * 注册全部任务通道、await 启动已装配实例一次、通过 Task 控制器把 IPC 调用路由
 * 到同一实例 api、destroy 时移除全部通道、恰好 dispose 一次，且 start 失败时
 * 执行清理。同时固定每个 handle 的状态机：重复 register() 抛错、destroy 后
 * register() 抛错、失败注册会逆向移除本次已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { TaskChannels } from '@memoflow/contracts/electron';
import type { TaskApplicationPort } from '../server/application';
import type { TaskModuleInstance } from '../server/infrastructure';

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

import { createTaskElectronModule } from './index';

function createApiStub(): TaskApplicationPort {
  const noop = vi.fn(() => ok([] as never));
  const templateFn = vi.fn(() => ok([] as never));
  const instanceFn = vi.fn(() => ok([] as never));
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
    getTaskPlan: templateFn,
    listTaskPlans: templateFn,
    completeTaskOccurrence: instanceFn,
    uncompleteTaskOccurrence: instanceFn,
    skipTaskOccurrence: instanceFn,
    startTaskOccurrence: instanceFn,
    deleteTaskOccurrence: instanceFn,
    markTaskOccurrenceMissed: instanceFn,
    getTaskOccurrence: instanceFn,
    listTaskOccurrencesByAccount: instanceFn,
    listTaskOccurrencesByTemplate: instanceFn,
    listTaskOccurrencesByStatus: instanceFn,
    getTaskOccurrencesByDateRange: instanceFn,
  } as TaskApplicationPort;
}

function createFakeInstance() {
  const api = createApiStub();
  const start = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});
  const instance: TaskModuleInstance = { api, start, dispose } as TaskModuleInstance;
  return { instance, api, start, dispose };
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

describe('createTaskElectronModule IPC lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createTaskElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createTaskElectronModule({ instance: fake.instance });
  });

  afterEach(() => {
    // destroy() is async and may reject (it can propagate a dispose error by
    // design); swallow it here so it does not leak into unrelated tests.
    // destroy() 是异步的且可能 reject（按设计可传播 dispose 错误）；
    // 在这里吞掉，避免泄漏到无关测试。
    try {
      void Promise.resolve(moduleDef.destroy?.()).catch(() => {
        /* expected for dispose-failure tests */
      });
    } catch {
      // destroy() may propagate a dispose error by design; don't leak it into unrelated tests.
    }
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it('registers all task channels and awaits the instance start once', async () => {
    await moduleDef.register(context);

    for (const channel of Object.values(TaskChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(TaskChannels).length);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', async () => {
    await moduleDef.register(context);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', async () => {
    await moduleDef.register(context);
    await moduleDef.destroy?.();

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('routes IPC calls through the controllers to the same instance api', async () => {
    await moduleDef.register(context);

    const listResult = await registered(TaskChannels.TEMPLATE_LIST)(undefined, {});
    expect(listResult).toMatchObject({ ok: true });
    expect(fake.api.listTaskPlans).toHaveBeenCalledTimes(1);

    const instanceResult = await registered(TaskChannels.INSTANCE_LIST)(undefined, {});
    expect(instanceResult).toMatchObject({ ok: true });
    expect(fake.api.listTaskOccurrencesByAccount).toHaveBeenCalledTimes(1);
  });

  it('validates Goal+KR list filters before invoking the Task application port', async () => {
    await moduleDef.register(context);
    const handler = registered(TaskChannels.TEMPLATE_LIST);
    const goalId = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
    const keyResultId = 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001';

    const valid = await handler(undefined, { goalId, keyResultId });
    expect(valid).toMatchObject({ ok: true });
    expect(fake.api.listTaskPlans).toHaveBeenLastCalledWith(
      expect.objectContaining({ goalId, keyResultId }),
    );

    vi.mocked(fake.api.listTaskPlans).mockClear();
    const invalid = await handler(undefined, { keyResultId });
    expect(invalid).toMatchObject({ ok: false });
    expect(fake.api.listTaskPlans).not.toHaveBeenCalled();
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', async () => {
    await moduleDef.register(context);

    await moduleDef.destroy?.();
    for (const channel of Object.values(TaskChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(TaskChannels).length);
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await moduleDef.destroy?.();
    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes, removes all channels, and rethrows when start() rejects, leaving a handle that cannot be re-registered', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the channels installed before ipcMain.handle() throws mid-registration', async () => {
    const allChannels = Object.values(TaskChannels);
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

    await expect(moduleDef.register(context)).rejects.toThrow('second handler');

    expect(mocks.handlers.size).toBe(0);
    expect(mocks.removeHandler).toHaveBeenCalledWith(allChannels[0]);
    expect(mocks.removeHandler).toHaveBeenCalledWith(allChannels[1]);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      allChannels[1],
      allChannels[0],
    ]);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.start).not.toHaveBeenCalled();

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
  });

  it('rethrows the original registration error even if dispose also rejects', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));
    fake.dispose.mockRejectedValue(new Error('dispose failed'));

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
  });

  it('destroy() after a failed registration neither disposes again nor re-removes channels', async () => {
    fake.start.mockRejectedValue(new Error('start failed'));

    await expect(moduleDef.register(context)).rejects.toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
    const removeHandlerCallsAfterFailedRegister = mocks.removeHandler.mock.calls.length;

    await moduleDef.destroy?.();

    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.removeHandler.mock.calls.length).toBe(removeHandlerCallsAfterFailedRegister);
  });
});
