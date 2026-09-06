/**
 * Schedule Electron IPC Lifecycle Spec
 * 日程 Electron IPC 生命周期测试
 *
 * Verifies that createScheduleElectronModule is a pure transport/lifecycle
 * adapter: register() installs the IPC transport WITHOUT starting the runtime
 * and WITHOUT importing a global accessor; the returned runtime controller
 * start/stop is idempotent and drives the same instance; destroy removes all
 * channels and stops the runtime exactly once. It also locks the per-handle
 * state machine: double register() throws, register-after-destroy throws, and a
 * failed registration reverses exactly the channels installed by that call.
 *
 * 验证 createScheduleElectronModule 是纯传输/生命周期适配器：
 * register() 只安装 IPC 传输，不启动 runtime，也不引入全局 accessor；返回的
 * runtime controller 的 start/stop 幂等且驱动同一实例；destroy 移除全部通道
 * 并恰好停止 runtime 一次。同时固定每个 handle 的状态机：重复 register() 抛错、
 * destroy 后 register() 抛错、失败注册会逆向移除本次已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { ScheduleModuleInstance } from '../server/infrastructure';

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

import { createScheduleElectronModule } from './index';

const desktopScheduleChannels = Object.values(ScheduleChannels);

function createFakeInstance() {
  const api = {
    listTasks: vi.fn(() => ok([] as never)),
    getTask: vi.fn(() => ok(null as never)),
    getDueTasks: vi.fn(() => ok([] as never)),
  };
  const eventApi = {
    createEvent: vi.fn(() => ok(null as never)),
    getEvent: vi.fn(() => ok(null as never)),
    listEvents: vi.fn(() => ok([] as never)),
    updateEvent: vi.fn(() => ok(null as never)),
    deleteEvent: vi.fn(() => ok(null as never)),
    getConflicts: vi.fn(() => ok([] as never)),
    detectConflicts: vi.fn(() => ok([] as never)),
    createEventWithConflictDetection: vi.fn(() => ok(null as never)),
    resolveConflict: vi.fn(() => ok(null as never)),
  };
  const start = vi.fn(async () => undefined);
  const dispose = vi.fn(async () => undefined);
  const instance: ScheduleModuleInstance = {
    scheduleRepository: {} as never,
    scheduleExecutionRepository: {} as never,
    scheduleTaskRepository: {} as never,
    useCases: {} as never,
    api,
    eventApi,
    start,
    dispose,
  } as ScheduleModuleInstance;
  return { instance, api, eventApi, start, dispose };
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

describe('createScheduleElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createScheduleElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createScheduleElectronModule({ instance: fake.instance });
  });

  afterEach(async () => {
    try {
      await moduleDef.destroy?.();
    } catch {
      // destroy() may propagate a dispose error by design; don't leak it into unrelated tests.
    }
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it('register installs all channels WITHOUT starting the runtime (delayed start)', () => {
    moduleDef.register(context);

    for (const channel of desktopScheduleChannels) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(desktopScheduleChannels.length);
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('runtime controller start/stop is idempotent and drives the same instance', async () => {
    moduleDef.register(context);

    await moduleDef.runtime.start();
    await moduleDef.runtime.start();
    expect(fake.start).toHaveBeenCalledTimes(1);

    await moduleDef.runtime.stop();
    await moduleDef.runtime.stop();
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await moduleDef.runtime.start();
    expect(fake.start).toHaveBeenCalledTimes(2);
  });

  it('destroy stops the runtime once and removes all channels', async () => {
    moduleDef.register(context);
    await moduleDef.runtime.start();
    expect(fake.start).toHaveBeenCalledTimes(1);

    await moduleDef.destroy?.();
    for (const channel of Object.values(ScheduleChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    await moduleDef.destroy?.();
    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', () => {
    moduleDef.register(context);

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('throws on register() after destroy()', async () => {
    moduleDef.register(context);
    await moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('routes IPC calls through the controllers to the same instance ports', async () => {
    fake.eventApi.listEvents.mockResolvedValue(ok([] as never));
    moduleDef.register(context);

    const listResult = await registered(ScheduleChannels.LIST)(undefined, undefined);
    expect(listResult).toMatchObject({ ok: true });
    expect(fake.eventApi.listEvents).toHaveBeenCalledTimes(1);
  });

  it('removes the channels installed before ipcMain.handle() throws mid-registration', () => {
    const registeredFirst: string[] = [];
    mocks.handle
      .mockImplementationOnce((channel: string, handler: (...args: unknown[]) => unknown) => {
        registeredFirst.push(channel);
        mocks.handlers.set(channel, handler);
      })
      .mockImplementationOnce((channel: string, handler: (...args: unknown[]) => unknown) => {
        registeredFirst.push(channel);
        mocks.handlers.set(channel, handler);
      })
      .mockImplementationOnce((channel: string) => {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      });

    expect(() => moduleDef.register(context)).toThrow('second handler');

    expect(mocks.handlers.size).toBe(0);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      registeredFirst[1],
      registeredFirst[0],
    ]);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.start).not.toHaveBeenCalled();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('rethrows the original registration error even if dispose also throws', () => {
    mocks.handle.mockImplementationOnce((channel: string) => {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    });
    fake.dispose.mockImplementation(async () => {
      throw new Error('dispose failed');
    });

    expect(() => moduleDef.register(context)).toThrow('second handler');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
  });

  it('destroy() after a failed registration neither disposes again nor re-removes channels', () => {
    mocks.handle.mockImplementationOnce((channel: string) => {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    });

    expect(() => moduleDef.register(context)).toThrow('second handler');
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
    expect(fake.start).not.toHaveBeenCalled();
  });
});
