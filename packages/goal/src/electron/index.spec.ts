/**
 * Goal Electron IPC Lifecycle Spec
 * 目标 Electron IPC 生命周期测试
 *
 * Verifies that createGoalElectronModule is a pure transport/lifecycle
 * adapter: it registers all goal channels, starts the already-assembled
 * instance once, routes IPC calls through GoalController to the same instance
 * api, removes all channels on destroy, disposes exactly once, and cleans up on
 * start failure. It also locks the per-handle state machine: double register()
 * throws, register-after-destroy throws, and a failed registration reverses
 * exactly the channels installed by that call.
 *
 * 验证 createGoalElectronModule 是纯传输/生命周期适配器：
 * 注册全部目标通道、启动已装配实例一次、通过 GoalController 把 IPC 调用路由
 * 到同一实例 api、destroy 时移除全部通道、恰好 dispose 一次，且 start 失败时
 * 执行清理。同时固定每个 handle 的状态机：重复 register() 抛错、destroy 后
 * register() 抛错、失败注册会逆向移除本次已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { GoalChannels } from '@memoflow/contracts/electron';
import type { GoalApplicationPort } from '../server/application';
import type { GoalModuleInstance } from '../server/infrastructure';

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

import { createGoalElectronModule } from './index';

function createApiStub(): GoalApplicationPort {
  return {
    createGoal: vi.fn(() => ok(null as never)),
    getGoal: vi.fn(() => ok(null as never)),
    listGoals: vi.fn(() => ok([] as never)),
    updateGoal: vi.fn(() => ok(null as never)),
    deleteGoal: vi.fn(() => ok(null as never)),
    permanentlyDeleteGoal: vi.fn(() => ok(null as never)),
    archiveGoal: vi.fn(() => ok(null as never)),
    abandonGoal: vi.fn(() => ok(null as never)),
    activateGoal: vi.fn(() => ok(null as never)),
    completeGoal: vi.fn(() => ok(null as never)),
    searchGoals: vi.fn(() => ok([] as never)),
    addKeyResult: vi.fn(() => ok(null as never)),
    updateKeyResult: vi.fn(() => ok(null as never)),
    updateKeyResultProgress: vi.fn(() => ok(null as never)),
    deleteKeyResult: vi.fn(() => ok(null as never)),
    addReview: vi.fn(() => ok(null as never)),
    listReviews: vi.fn(() => ok([] as never)),
    updateReview: vi.fn(() => ok(null as never)),
    deleteReview: vi.fn(() => ok(null as never)),
    createRecord: vi.fn(() => ok(null as never)),
    listRecords: vi.fn(() => ok([] as never)),
    deleteRecord: vi.fn(() => ok(null as never)),
    getGoalAggregate: vi.fn(() => ok(null as never)),
    cloneGoal: vi.fn(() => ok(null as never)),
    batchUpdateKeyResultWeights: vi.fn(() => ok(null as never)),
  } as GoalApplicationPort;
}

function createFakeInstance() {
  const api = createApiStub();
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: GoalModuleInstance = { api, start, dispose } as GoalModuleInstance;
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

describe('createGoalElectronModule IPC lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createGoalElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createGoalElectronModule({ instance: fake.instance });
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

  it('registers all goal channels and starts the instance once', () => {
    moduleDef.register(context);

    for (const channel of Object.values(GoalChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(GoalChannels).length);
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
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('routes IPC calls through the controller to the same instance api', async () => {
    moduleDef.register(context);

    const listResult = await registered(GoalChannels.LIST)(undefined, {});
    expect(listResult).toMatchObject({ ok: true });
    expect(fake.api.listGoals).toHaveBeenCalledTimes(1);

    const abandonResult = await registered(GoalChannels.ABANDON)(
      undefined,
      'IGoalId_00000000-0000-4000-8000-000000000001',
      { expectedVersion: 1 },
    );
    expect(abandonResult).toMatchObject({ ok: true });
    expect(fake.api.abandonGoal).toHaveBeenCalledTimes(1);
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    moduleDef.destroy?.();
    for (const channel of Object.values(GoalChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(GoalChannels).length);
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes, removes all channels, and rethrows when start() throws, leaving a handle that cannot be re-registered', () => {
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
    const allChannels = Object.values(GoalChannels);
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
    expect(mocks.removeHandler).toHaveBeenCalledWith(allChannels[0]);
    expect(mocks.removeHandler).toHaveBeenCalledWith(allChannels[1]);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      allChannels[1],
      allChannels[0],
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
});
