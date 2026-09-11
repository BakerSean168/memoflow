/**
 * Governance Electron IPC Lifecycle Spec
 * 治理 Electron IPC 生命周期测试
 *
 * Verifies that createGovernanceElectronModule is a pure transport/lifecycle
 * adapter: it registers all governance channels, starts the already-assembled
 * instance once, routes IPC calls through GovernanceController to the same
 * instance api, removes all channels on destroy, disposes exactly once, and
 * cleans up on start failure. It also locks the per-handle state machine:
 * double register() throws, register-after-destroy throws, and a failed
 * registration reverses exactly the channels installed by that call.
 *
 * 验证 createGovernanceElectronModule 是纯传输/生命周期适配器：
 * 注册全部治理通道、启动已装配实例一次、通过 GovernanceController 把 IPC
 * 调用路由到同一实例 api、destroy 时移除全部通道、恰好 dispose 一次，
 * 且 start 失败时执行清理。同时固定每个 handle 的状态机：重复 register()
 * 抛错、destroy 后 register() 抛错、失败注册会逆向移除本次已安装的通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { GovernanceChannels } from '@memoflow/contracts/governance';
import type { GovernanceApplicationPort } from '../server/application';
import type { GovernanceModuleInstance } from '../server/infrastructure';

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

import { createGovernanceElectronModule } from './index';

function createApiStub(): GovernanceApplicationPort {
  return {
    createRule: vi.fn(() => ok(null as never)),
    updateRule: vi.fn(() => ok(null as never)),
    deleteRule: vi.fn(() => ok(null as never)),
    getRule: vi.fn(() => ok(null as never)),
    listRules: vi.fn(() => ok([] as never)),
    searchRules: vi.fn(() => ok([] as never)),
    getRevisions: vi.fn(() => ok(null as never)),
    exportRuleBundle: vi.fn(() =>
      ok({
        kind: 'memoflow.governance-rule-bundle' as const,
        schemaVersion: 1 as const,
        hashAlgorithm: 'sha256' as const,
        semanticHash: `sha256:${'0'.repeat(64)}`,
        rules: [],
      }),
    ),
  } as GovernanceApplicationPort;
}

function createFakeInstance() {
  const api = createApiStub();
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: GovernanceModuleInstance = { api, start, dispose };
  return { instance, api, start, dispose };
}

function createFakeContext(): IElectronModuleContext {
  return {
    db: {},
    auth: {
      requireRequestContext: vi.fn().mockResolvedValue({
        requestId: 'req-governance-ipc',
        traceId: 'req-governance-ipc',
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

describe('createGovernanceElectronModule IPC lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createGovernanceElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    moduleDef = createGovernanceElectronModule({ instance: fake.instance });
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

  it('registers all 8 governance channels and starts the instance once', () => {
    moduleDef.register(context);

    for (const channel of Object.values(GovernanceChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(mocks.handlers.size).toBe(Object.values(GovernanceChannels).length);
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

    const listResult = await registered(GovernanceChannels.RULE_LIST)(undefined, {});
    expect(listResult).toMatchObject({ ok: true });
    expect(fake.api.listRules).toHaveBeenCalledTimes(1);

    const searchResult = await registered(GovernanceChannels.RULE_SEARCH)(undefined, {
      query: 'architecture',
    });
    expect(searchResult).toMatchObject({ ok: true });
    expect(fake.api.searchRules).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ identityId: 'identity-1', source: 'ipc' }),
    );

    const bundleResult = await registered(GovernanceChannels.RULE_BUNDLE_EXPORT)(undefined, {});
    expect(bundleResult).toMatchObject({
      ok: true,
      data: {
        kind: 'memoflow.governance-rule-bundle',
        schemaVersion: 1,
        semanticHash: `sha256:${'0'.repeat(64)}`,
      },
    });
    expect(fake.api.exportRuleBundle).toHaveBeenCalledTimes(1);
  });

  it('destroy removes all channels and disposes exactly once (second call no-ops)', () => {
    moduleDef.register(context);

    moduleDef.destroy?.();
    for (const channel of Object.values(GovernanceChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(mocks.removeHandler).toHaveBeenCalledTimes(Object.values(GovernanceChannels).length);
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
    const allChannels = Object.values(GovernanceChannels);
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
});
