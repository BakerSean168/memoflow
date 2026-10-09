/**
 * Repository Electron IPC Lifecycle Spec
 * 仓库 Electron IPC 生命周期测试
 *
 * Verifies that createRepositoryElectronModule is a pure transport/lifecycle
 * adapter over the host-provided repository ports: it registers all repository
 * channels, owns the auto-sync scheduler lifecycle, and cleans up on failure.
 * It also locks the per-handle state machine: double register() throws,
 * register-after-destroy throws, and a failed registration reverses exactly the
 * channels installed by that call and best-effort stops the auto-sync
 * scheduler. No `ctx.db` is read for assembly.
 *
 * 验证 createRepositoryElectronModule 是宿主持有仓库 ports 之上的纯传输/
 * 生命周期适配器：注册全部仓库通道、托管 auto-sync scheduler 生命周期，且
 * 失败时执行清理。同时固定每个 handle 的状态机：重复 register() 抛错、
 * destroy 后 register() 抛错、失败注册会逆向移除本次已安装的通道并
 * best-effort 停止 auto-sync scheduler。装配时不读取 `ctx.db`。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { EventEmitter } from 'node:events';
import { LocalVaultRuntimeError } from './local-vault-runtime';

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
  app: { getPath: vi.fn(() => '/tmp/repository-electron-test') },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn() },
  ipcMain: {
    handle: mocks.handle,
    removeHandler: mocks.removeHandler,
  },
}));

import { createRepositoryElectronModule } from './index';

function createHostPorts() {
  const localVaultPort = {
    getBinding: vi.fn(),
    selectVault: vi.fn(),
    detachVault: vi.fn(),
    scanVault: vi.fn(),
    readNote: vi.fn(),
    findNoteById: vi.fn(),
    dispose: vi.fn(async () => undefined),
    searchVault: vi.fn(),
    openInObsidian: vi.fn(),
    writeConfirmedNote: vi.fn(),
    inspectSyncContent: vi.fn(),
  };
  const knowledgeRepositoryConnectionPort = {
    startKnowledgeRepositoryInstallation: vi.fn(),
    completeKnowledgeRepositoryInstallation: vi.fn(),
    listKnowledgeRepositoryConnections: vi.fn(),
    connectKnowledgeRepository: vi.fn(async () => ok(null as never)),
    disconnectKnowledgeRepository: vi.fn(async () => ok(null as never)),
    issueDesktopKnowledgeRepositoryToken: vi.fn(),
    listKnowledgeWriteRequests: vi.fn(),
    replayKnowledgeWriteRequestProjection: vi.fn(),
    previewKnowledgeRepositoryReconciliation: vi.fn(async () => ok(null as never)),
  };
  const knowledgeRepositoryReconciliationPort = {
    execute: vi.fn(async () => ok(null as never)),
  };
  const knowledgeRepositorySyncPort = {
    execute: vi.fn(async () => ok(null as never)),
  };
  const knowledgeRepositoryAutoSyncScheduler = {
    start: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  return {
    localVaultPort,
    knowledgeRepositoryConnectionPort,
    knowledgeRepositoryReconciliationPort,
    knowledgeRepositorySyncPort,
    knowledgeRepositoryAutoSyncScheduler,
  };
}

function createFakeContext(): IElectronModuleContext {
  return {
    db: {},
    auth: {
      getIdentityId: vi.fn(async () => 'identity-1'),
      requireRequestContext: vi.fn(async () => ({ identityId: 'identity-1' })),
    },
  } as unknown as IElectronModuleContext;
}

function registered(channel: string) {
  const handler = mocks.handlers.get(channel);
  expect(handler, `Expected ${channel} to be registered`).toBeDefined();
  return handler!;
}

describe('createRepositoryElectronModule lifecycle', () => {
  let ports: ReturnType<typeof createHostPorts>;
  let context: IElectronModuleContext;
  let moduleDef: ReturnType<typeof createRepositoryElectronModule>;

  beforeEach(() => {
    ports = createHostPorts();
    context = createFakeContext();
    moduleDef = createRepositoryElectronModule({
      localVaultPort: ports.localVaultPort as never,
      knowledgeRepositoryConnectionPort: ports.knowledgeRepositoryConnectionPort as never,
      knowledgeRepositoryReconciliationPort: ports.knowledgeRepositoryReconciliationPort,
      knowledgeRepositorySyncPort: ports.knowledgeRepositorySyncPort,
      knowledgeRepositoryAutoSyncScheduler: ports.knowledgeRepositoryAutoSyncScheduler,
    });
  });

  afterEach(async () => {
    try {
      await moduleDef.destroy?.();
    } catch {
      // destroy() may propagate by design; don't leak it into unrelated tests.
    }
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  it('registers all repository channels and starts the auto-sync scheduler once', async () => {
    await moduleDef.register(context);

    for (const channel of Object.values(RepositoryChannels)) {
      expect(mocks.handlers.has(channel), `Expected ${channel} to be registered`).toBe(true);
    }
    expect(ports.knowledgeRepositoryAutoSyncScheduler.start).toHaveBeenCalledWith('identity-1');
  });

  it('throws on a second register() call (single registration per handle)', async () => {
    await moduleDef.register(context);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
    expect(ports.knowledgeRepositoryAutoSyncScheduler.start).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous search from the same renderer when the query is cleared', async () => {
    await moduleDef.register(context);
    const sender = Object.assign(new EventEmitter(), { id: 7 });
    const search = mocks.handlers.get(RepositoryChannels.LOCAL_VAULT_SEARCH)!;
    ports.localVaultPort.searchVault.mockImplementationOnce(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new LocalVaultRuntimeError('CONFLICT', 'Cancelled')),
            { once: true },
          );
        }),
    );
    const pending = search({ sender }, { query: 'previous' });
    await vi.waitFor(() => expect(ports.localVaultPort.searchVault).toHaveBeenCalledTimes(1));
    ports.localVaultPort.searchVault.mockResolvedValueOnce({ query: '', results: [] });
    await expect(search({ sender }, { query: '' })).resolves.toMatchObject({ ok: true });
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(sender.listenerCount('destroyed')).toBe(0);
  });

  it('throws on register() after destroy()', async () => {
    await moduleDef.register(context);
    await moduleDef.destroy?.();
    expect(ports.localVaultPort.dispose).toHaveBeenCalledTimes(1);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
  });

  it('destroy stops the scheduler once, removes all channels, and is idempotent', async () => {
    await moduleDef.register(context);

    await moduleDef.destroy?.();
    expect(ports.knowledgeRepositoryAutoSyncScheduler.stop).toHaveBeenCalledTimes(1);
    expect(ports.knowledgeRepositoryAutoSyncScheduler.stop).toHaveBeenCalledWith({
      commitPendingChanges: true,
    });
    for (const channel of Object.values(RepositoryChannels)) {
      expect(mocks.handlers.has(channel)).toBe(false);
    }
    expect(fakeRemoveHandlerCount()).toBe(Object.values(RepositoryChannels).length);

    await moduleDef.destroy?.();
    await moduleDef.destroy?.();
    expect(ports.knowledgeRepositoryAutoSyncScheduler.stop).toHaveBeenCalledTimes(1);
  });

  it('removes the channels installed before ipcMain.handle() throws mid-registration', async () => {
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

    await expect(moduleDef.register(context)).rejects.toThrow('second handler');

    expect(mocks.handlers.size).toBe(0);
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      registeredFirst[1],
      registeredFirst[0],
    ]);
    expect(ports.knowledgeRepositoryAutoSyncScheduler.start).not.toHaveBeenCalled();
    expect(ports.localVaultPort.dispose).toHaveBeenCalledTimes(1);

    await expect(moduleDef.register(context)).rejects.toThrow(/only register once/);
  });

  it('destroy() after a failed registration neither stops the scheduler again nor re-removes channels', async () => {
    mocks.handle.mockImplementationOnce((channel: string) => {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    });

    await expect(moduleDef.register(context)).rejects.toThrow('second handler');
    expect(mocks.handlers.size).toBe(0);
    const removeHandlerCallsAfterFailedRegister = mocks.removeHandler.mock.calls.length;
    const stopCallsAfterFailedRegister =
      ports.knowledgeRepositoryAutoSyncScheduler.stop.mock.calls.length;

    await moduleDef.destroy?.();

    expect(mocks.removeHandler.mock.calls.length).toBe(removeHandlerCallsAfterFailedRegister);
    expect(ports.knowledgeRepositoryAutoSyncScheduler.stop.mock.calls.length).toBe(
      stopCallsAfterFailedRegister,
    );
  });

  it('register works with a context that has no db property (no db read for assembly)', async () => {
    const contextWithoutDb = { ...context } as IElectronModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    await expect(moduleDef.register(contextWithoutDb)).resolves.toBeUndefined();
  });
});

function fakeRemoveHandlerCount(): number {
  return mocks.removeHandler.mock.calls.length;
}
