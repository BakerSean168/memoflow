/**
 * Account Electron IPC Lifecycle + Behavior Spec
 * 账户 Electron IPC 生命周期与行为测试
 *
 * Verifies that createAccountElectronModule is a pure transport/lifecycle
 * adapter: it registers all account channels, starts the already-assembled
 * instance once, routes IPC calls through AccountController to the same
 * instance api, removes all channels on destroy, disposes exactly once, and
 * cleans up on start failure. It also locks the per-handle state machine:
 * double register() throws, register-after-destroy throws, and a failed
 * registration reverses exactly the channels installed by that call. The
 * cloud-close saga behavior (guest rejection, reauth gate, fail-closed
 * marker ordering) is preserved against the host-provided syncOptions.
 *
 * 验证 createAccountElectronModule 是纯传输/生命周期适配器：注册全部账户
 * 通道、启动已装配实例一次、通过 AccountController 把 IPC 调用路由到同一
 * 实例 api、destroy 时移除全部通道、恰好 dispose 一次，且 start 失败时执行
 * 清理。同时固定每个 handle 的状态机：重复 register() 抛错、destroy 后
 * register() 抛错、失败注册会逆向移除本次已安装的通道。cloud-close saga 行为
 * （访客拒绝、re-auth 门禁、fail-closed marker 顺序）针对宿主持有的
 * syncOptions 保持不变。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { AccountModuleInstance } from '../server/infrastructure';

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

import { createAccountElectronModule } from './index';

function createFakeInstance() {
  const api = {
    listAccounts: vi.fn(() => ok([] as never)),
    getProfile: vi.fn(() => ok(null as never)),
    updateProfile: vi.fn(() => ok(null as never)),
    closeAccount: vi.fn(() => ok(null as never)),
    queryClosureTimeline: vi.fn(() => ok([] as never)),
    replayClosure: vi.fn(() => ok(null as never)),
    getOperationAudit: vi.fn(() => ok([] as never)),
  };
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: AccountModuleInstance = {
    accountRepository: {} as never,
    useCases: {} as never,
    api,
    start,
    dispose,
  } as AccountModuleInstance;
  return { instance, api, start, dispose };
}

function createFakeContext(): IElectronModuleContext {
  return {
    db: {},
    auth: {
      requireRequestContext: vi.fn().mockResolvedValue({
        requestId: 'req-account-ipc',
        traceId: 'req-account-ipc',
        startedAt: 1_700_000_000_000,
        source: 'ipc',
        identityId: 'identity-1',
        deviceId: 'desktop-app',
      }),
    },
  } as unknown as IElectronModuleContext;
}

function registered(channel: string) {
  const handler = mocks.handlers.get(channel);
  expect(handler, `Expected ${channel} to be registered`).toBeDefined();
  return handler!;
}

describe('createAccountElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createAccountElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createAccountElectronModule({ instance: fake.instance });
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

  it('registers all account channels and starts the instance once', () => {
    moduleDef.register(context);

    for (const channel of Object.values(AccountChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(AccountChannels).length);
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
    fake.api.getProfile.mockResolvedValue(ok({ id: 'profile-1' } as never));
    moduleDef.register(context);

    const meResult = await registered(AccountChannels.GET_ME)(undefined, undefined);
    expect(meResult).toMatchObject({ ok: true });
    expect(fake.api.getProfile).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', source: 'ipc' }),
    );
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    moduleDef.destroy?.();
    for (const channel of Object.values(AccountChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(AccountChannels).length);
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

  it('removes only the channels installed before ipcMain.handle() throws mid-registration', () => {
    const allChannels = Object.values(AccountChannels);
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

  it('register works with a context that has no db property (no db read for assembly)', () => {
    const contextWithoutDb = { ...context } as IElectronModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();
    expect(fake.start).toHaveBeenCalledTimes(1);
  });
});

describe('AccountElectronModule cloud-close behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  function createContextWithDbGetOptional(): IElectronModuleContext {
    return {
      db: {
        getOptional: vi.fn().mockResolvedValue(null),
      },
      auth: {
        requireRequestContext: vi.fn().mockResolvedValue({
          requestId: 'req-account-cloud',
          traceId: 'req-account-cloud',
          startedAt: 1_700_000_000_000,
          source: 'ipc',
          identityId: 'cloud-1',
          deviceId: 'desktop-app',
        }),
      },
    } as unknown as IElectronModuleContext;
  }

  it('maps a missing local profile to NOT_FOUND on GET_ME', async () => {
    const fake = createFakeInstance();
    fake.api.getProfile.mockResolvedValue(ok(null));
    const module = createAccountElectronModule({ instance: fake.instance });
    const context = {
      db: {},
      auth: {
        requireRequestContext: vi.fn().mockResolvedValue({
          requestId: 'req-account-ipc',
          traceId: 'req-account-ipc',
          startedAt: 1_700_000_000_000,
          source: 'ipc',
          identityId: 'identity-1',
          deviceId: 'desktop-app',
        }),
      },
    } as unknown as IElectronModuleContext;

    module.register(context);
    const result = await registered(AccountChannels.GET_ME)(undefined, undefined);

    expect(fake.api.getProfile).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', source: 'ipc' }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    module.destroy?.();
  });

  it('rejects guest cloud account closure before any remote call', async () => {
    const fake = createFakeInstance();
    const closeCloudAccount = vi.fn();
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => null,
        getCloudAccessToken: async () => 'token',
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
      },
    });
    const context = {
      db: {
        getOptional: vi.fn().mockResolvedValue(null),
      },
      auth: {
        requireRequestContext: vi.fn().mockResolvedValue({
          requestId: 'req-account-guest',
          traceId: 'req-account-guest',
          startedAt: 1_700_000_000_000,
          source: 'ipc',
          identityId: 'guest-1',
          deviceId: 'desktop-app',
        }),
      },
    } as unknown as IElectronModuleContext;
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'CLOUD_ACCOUNT_REQUIRED' } });
    expect(closeCloudAccount).not.toHaveBeenCalled();
    module.destroy?.();
  });

  it('requires a live cloud session before closing a registered account', async () => {
    const fake = createFakeInstance();
    const closeCloudAccount = vi.fn();
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => 'cloud-1',
        getCloudAccessToken: async () => null,
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
      },
    });
    const context = createContextWithDbGetOptional();
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'REAUTH_REQUIRED' } });
    expect(closeCloudAccount).not.toHaveBeenCalled();
    module.destroy?.();
  });

  it('closes cloud first, updates the local projection, then disconnects sync', async () => {
    const fake = createFakeInstance();
    const mockReceipt = {
      operationId: 'op-1',
      identityId: 'cloud-1',
      idempotencyKey: 'key-1',
      phase: 'closed',
      status: 'succeeded',
      retryable: false,
      signedOut: true,
      attempts: 1,
      lastError: null,
      createdAt: 100,
      finishedAt: 200,
    };
    const closeCloudAccount = vi.fn().mockResolvedValue(mockReceipt);
    const markAccountClosing = vi.fn().mockResolvedValue(undefined);
    const clearAccountClosingMarker = vi.fn().mockResolvedValue(undefined);
    const afterCloudAccountClosed = vi.fn().mockResolvedValue(undefined);
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => 'cloud-1',
        getCloudAccessToken: async () => 'token',
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
        markAccountClosing,
        clearAccountClosingMarker,
        afterCloudAccountClosed,
      },
    });
    const context = createContextWithDbGetOptional();
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    expect(result).toEqual(ok(mockReceipt));
    expect(closeCloudAccount).toHaveBeenCalledWith('token', { reason: 'No longer needed' });
    expect(afterCloudAccountClosed).toHaveBeenCalledOnce();
    module.destroy?.();
  });

  it('marks account closing locally BEFORE the cloud close call (fail-closed window), clears after success', async () => {
    const fake = createFakeInstance();
    const mockReceipt = {
      operationId: 'op-2',
      identityId: 'cloud-1',
      idempotencyKey: 'key-2',
      phase: 'closed',
      status: 'succeeded',
      retryable: false,
      signedOut: true,
      attempts: 1,
      lastError: null,
      createdAt: 100,
      finishedAt: 200,
    };
    const closeCloudAccount = vi.fn().mockResolvedValue(mockReceipt);
    const markAccountClosing = vi.fn().mockResolvedValue(undefined);
    const clearAccountClosingMarker = vi.fn().mockResolvedValue(undefined);
    const afterCloudAccountClosed = vi.fn().mockResolvedValue(undefined);
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => 'cloud-1',
        getCloudAccessToken: async () => 'token',
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
        markAccountClosing,
        clearAccountClosingMarker,
        afterCloudAccountClosed,
      },
    });
    const context = createContextWithDbGetOptional();
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    expect(result).toEqual(ok(mockReceipt));
    // fail-closed ordering: local marker set BEFORE the cloud call begins
    const markOrder = markAccountClosing.mock.invocationCallOrder[0];
    const closeOrder = closeCloudAccount.mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(closeOrder);
    expect(afterCloudAccountClosed).toHaveBeenCalledOnce();
    module.destroy?.();
  });

  it('clears the closure marker when the cloud close FAILS (no permanent local lock)', async () => {
    const fake = createFakeInstance();
    const closeCloudAccount = vi.fn().mockRejectedValue(new Error('cloud unavailable'));
    const markAccountClosing = vi.fn().mockResolvedValue(undefined);
    const clearAccountClosingMarker = vi.fn().mockResolvedValue(undefined);
    const afterCloudAccountClosed = vi.fn().mockResolvedValue(undefined);
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => 'cloud-1',
        getCloudAccessToken: async () => 'token',
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
        markAccountClosing,
        clearAccountClosingMarker,
        afterCloudAccountClosed,
      },
    });
    const context = createContextWithDbGetOptional();
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CLOUD_ACCOUNT_CLOSE_FAILED');
    }
    expect(markAccountClosing).toHaveBeenCalledOnce();
    expect(clearAccountClosingMarker).toHaveBeenCalledWith('cloud-1');
    expect(afterCloudAccountClosed).not.toHaveBeenCalled();
    module.destroy?.();
  });

  it('keeps the closure marker when cloud close SUCCEEDS but local teardown callback fails (fail-closed)', async () => {
    const fake = createFakeInstance();
    const mockReceipt = {
      operationId: 'op-3',
      identityId: 'cloud-1',
      idempotencyKey: 'key-3',
      phase: 'closed',
      status: 'succeeded',
      retryable: false,
      signedOut: true,
      attempts: 1,
      lastError: null,
      createdAt: 100,
      finishedAt: 200,
    };
    const closeCloudAccount = vi.fn().mockResolvedValue(mockReceipt);
    const markAccountClosing = vi.fn().mockResolvedValue(undefined);
    const clearAccountClosingMarker = vi.fn().mockResolvedValue(undefined);
    const afterCloudAccountClosed = vi.fn().mockRejectedValue(new Error('session store failure'));
    const module = createAccountElectronModule({
      instance: fake.instance,
      syncOptions: {
        getCloudAccountId: () => 'cloud-1',
        getCloudAccessToken: async () => 'token',
        pushCloudProfile: vi.fn(),
        closeCloudAccount,
        markAccountClosing,
        clearAccountClosingMarker,
        afterCloudAccountClosed,
      },
    });
    const context = createContextWithDbGetOptional();
    module.register(context);

    const result = await registered(AccountChannels.CLOSE)(undefined, {
      reason: 'No longer needed',
    });

    // Cloud close succeeded — the marker MUST NOT be cleared (local new-work stays blocked)
    expect(clearAccountClosingMarker).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CLOUD_ACCOUNT_CLOSE_TEARDOWN_FAILED');
    }
    module.destroy?.();
  });
});
