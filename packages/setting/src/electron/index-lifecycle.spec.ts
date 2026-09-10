/**
 * Setting Electron IPC Lifecycle Spec
 * 设置 Electron IPC 生命周期测试
 *
 * Verifies that createSettingElectronModule is a pure transport/lifecycle
 * adapter: it registers all setting channels, starts the already-assembled
 * instance once, routes IPC calls to the same instance api, removes all
 * channels on destroy, disposes exactly once, and cleans up on start failure.
 * It also locks the per-handle state machine: double register() throws,
 * register-after-destroy throws, and a failed registration reverses exactly the
 * channels installed by that call.
 *
 * 验证 createSettingElectronModule 是纯传输/生命周期适配器：
 * 注册全部设置通道、启动已装配实例一次、把 IPC 调用路由到同一实例 api、
 * destroy 时移除全部通道、恰好 dispose 一次，且 start 失败时执行清理。
 * 同时固定每个 handle 的状态机：重复 register() 抛错、destroy 后 register()
 * 抛错、失败注册会逆向移除本次已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { SettingModuleInstance } from '../server/infrastructure';

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

import { createSettingElectronModule } from './index';

function createFakeInstance() {
  const api = {
    getUserSetting: vi.fn(() => ok(null as never)),
    getDefaultSettings: vi.fn(() => ok({})),
    patchUserSetting: vi.fn(() => ok(null as never)),
    resetUserSetting: vi.fn(() => ok(null as never)),
    importSettings: vi.fn(() => ok(null as never)),
    exportSettings: vi.fn(() => ok({})),
  };
  const portableCapability = { key: 'preferences', schemaVersion: 3 } as never;
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: SettingModuleInstance = {
    userSettingRepository: {} as never,
    portableCapability,
    useCases: {} as never,
    api,
    start,
    dispose,
  } as SettingModuleInstance;
  return { instance, api, portableCapability, start, dispose };
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

describe('createSettingElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createSettingElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createSettingElectronModule({ instance: fake.instance });
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

  it('exposes the owner portability capability on the host-facing handle', () => {
    expect(moduleDef.portableCapability).toBe(fake.portableCapability);
  });

  it('registers all setting channels and starts the instance once', () => {
    moduleDef.register(context);

    for (const channel of Object.values(SettingChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(SettingChannels).length);
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

  it('routes IPC calls through to the same instance api', async () => {
    fake.api.getUserSetting.mockResolvedValue(ok({ theme: 'dark' } as never));
    moduleDef.register(context);

    const result = await registered(SettingChannels.GET_ALL)(undefined, undefined);
    expect(result).toMatchObject({ ok: true });
    expect(fake.api.getUserSetting).toHaveBeenCalledTimes(1);
  });

  it('imports only JSON-text V3 payloads with the host-owned identity', async () => {
    const document = {
      schemaVersion: 3,
      exportedAt: '2026-09-10T05:00:00.000Z',
      preferences: {
        presentation: { theme: 'dark', language: 'en-US' },
        regional: {
          timeZone: 'Asia/Tokyo',
          dateStyle: 'long',
          timeStyle: '12h',
          weekStartsOn: 0,
        },
      },
    };
    const receipt = { schemaVersion: 3, imported: 2, skipped: 0, warnings: [] };
    fake.api.importSettings.mockResolvedValue(receipt as never);
    moduleDef.register(context);

    const result = await registered(SettingChannels.IMPORT)(undefined, {
      data: JSON.stringify(document),
    });

    expect(fake.api.importSettings).toHaveBeenCalledWith('identity-1', document);
    expect(result).toEqual({ ok: true, data: receipt });
  });

  it('rejects non-text or malformed preference import payloads before owner mutation', async () => {
    moduleDef.register(context);
    const handler = registered(SettingChannels.IMPORT);

    await expect(handler(undefined, { data: { schemaVersion: 3 } })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    await expect(handler(undefined, { data: '{not-json' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(fake.api.importSettings).not.toHaveBeenCalled();
  });

  it('returns the V3 export artifact without a second JSON encoding layer', async () => {
    const artifact = {
      data: '{"schemaVersion":3}',
      fileName: 'memoflow-settings.json',
    };
    fake.api.exportSettings.mockResolvedValue(artifact as never);
    moduleDef.register(context);

    const result = await registered(SettingChannels.EXPORT)(undefined, undefined);

    expect(fake.api.exportSettings).toHaveBeenCalledWith('identity-1');
    expect(result).toEqual({ ok: true, data: artifact });
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    moduleDef.destroy?.();
    for (const channel of Object.values(SettingChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(SettingChannels).length);
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
