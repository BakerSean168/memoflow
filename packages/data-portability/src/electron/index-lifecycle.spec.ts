/**
 * Data Portability Electron IPC Lifecycle Spec
 * 数据导出导入 Electron IPC 生命周期测试
 *
 * Verifies that createDataPortabilityElectronModule is a pure
 * transport/lifecycle adapter: it registers the V3 EXPORT/DRY_RUN/APPLY channels, starts
 * the already-assembled instance once, removes all channels on destroy,
 * disposes exactly once, and cleans up on start failure. It also locks the
 * per-handle state machine: double register() throws, register-after-destroy
 * throws, and a failed registration reverses exactly the channels installed by
 * that call.
 *
 * 验证 createDataPortabilityElectronModule 是纯传输/生命周期适配器：
 * 注册 EXPORT/IMPORT 通道、启动已装配实例一次、destroy 时移除全部通道、
 * 恰好 dispose 一次，且 start 失败时执行清理。同时固定每个 handle 的状态机：
 * 重复 register() 抛错、destroy 后 register() 抛错、失败注册会逆向移除本次
 * 已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataPortabilityChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { DataPortabilityModuleInstance } from '../server/infrastructure/data-portability.module';

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

import { createDataPortabilityElectronModule } from './index';

function createFakeInstance() {
  const api = {
    exportPortableDataV3: vi.fn(() => ok(null as never)),
    dryRunPortableDataV3: vi.fn(() => ok(null as never)),
    applyPortableDataV3: vi.fn(() => ok(null as never)),
  };
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: DataPortabilityModuleInstance = {
    useCases: {} as never,
    api,
    start,
    dispose,
  } as DataPortabilityModuleInstance;
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

describe('createDataPortabilityElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createDataPortabilityElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createDataPortabilityElectronModule({ instance: fake.instance });
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

  it('registers all data-portability channels and starts the instance once', () => {
    moduleDef.register(context);

    for (const channel of Object.values(DataPortabilityChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(DataPortabilityChannels).length);
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
  });

  it('routes IPC calls through the controller to the same instance api', async () => {
    fake.api.exportPortableDataV3.mockResolvedValue(
      ok({
        fileName: 'export.json',
        content: '{}',
        summary: { capabilityKeys: [], warnings: [] },
      } as never),
    );
    moduleDef.register(context);

    const result = await registered(DataPortabilityChannels.EXPORT)(undefined, {
      capabilities: ['preferences'],
    });
    expect(result).toMatchObject({ ok: true });
    expect(fake.api.exportPortableDataV3).toHaveBeenCalledTimes(1);
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    moduleDef.destroy?.();
    for (const channel of Object.values(DataPortabilityChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(DataPortabilityChannels).length);
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
    const allChannels = Object.values(DataPortabilityChannels);
    mocks.handle
      .mockImplementationOnce((channel: string, handler: (...args: unknown[]) => unknown) => {
        mocks.handlers.set(channel, handler);
      })
      .mockImplementationOnce((channel: string) => {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      });

    expect(() => moduleDef.register(context)).toThrow('second handler');

    expect(mocks.handlers.size).toBe(0);
    expect(mocks.removeHandler).toHaveBeenCalledWith(allChannels[0]);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([allChannels[0]]);
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

  it('register works with a context that has no db property (no db read for assembly)', () => {
    const contextWithoutDb = { ...context } as IElectronModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();
    expect(fake.start).toHaveBeenCalledTimes(1);
  });
});
