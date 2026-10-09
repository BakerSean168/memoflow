import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
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

function handler(channel: string) {
  const registered = mocks.handlers.get(channel);
  expect(registered, `Expected ${channel} to be registered`).toBeDefined();
  return registered!;
}

describe('RepositoryElectronModule automatic synchronization lifecycle', () => {
  let module: ReturnType<typeof createRepositoryElectronModule> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  afterEach(async () => {
    await module?.destroy?.();
    module = null;
  });

  it('starts per profile, refreshes after connection/reconciliation, and flushes on destroy', async () => {
    const scheduler = {
      start: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const connectionPort = {
      startKnowledgeRepositoryInstallation: vi.fn(),
      completeKnowledgeRepositoryInstallation: vi.fn(),
      listKnowledgeRepositoryConnections: vi.fn(),
      connectKnowledgeRepository: vi.fn(async () => ok({ id: 'connection-1' } as never)),
      disconnectKnowledgeRepository: vi.fn(async () => ok(null)),
      issueDesktopKnowledgeRepositoryToken: vi.fn(),
      previewKnowledgeRepositoryReconciliation: vi.fn(),
    };
    const reconciliationPort = {
      execute: vi.fn(async () => ok({ headSha: 'a'.repeat(40) } as never)),
    };
    const syncPort = {
      execute: vi.fn(async () => ok({ headSha: 'a'.repeat(40) } as never)),
    };
    const localVault = {
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
    const context = {
      db: {},
      auth: {
        getIdentityId: vi.fn(async () => 'identity-1'),
        requireRequestContext: vi.fn(async () => ({ identityId: 'identity-1' })),
      },
    } as unknown as IElectronModuleContext;
    module = createRepositoryElectronModule({
      localVaultPort: localVault as never,
      knowledgeRepositoryConnectionPort: connectionPort as never,
      knowledgeRepositoryReconciliationPort: reconciliationPort,
      knowledgeRepositorySyncPort: syncPort,
      knowledgeRepositoryAutoSyncScheduler: scheduler,
    });

    await module.register(context);
    expect(scheduler.start).toHaveBeenCalledWith('identity-1');

    await handler(RepositoryChannels.KNOWLEDGE_CONNECTION_CONNECT)(null, {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    await handler(RepositoryChannels.KNOWLEDGE_CONNECTION_DISCONNECT)(null, {
      connectionId: 'connection-1',
      purgeCloudData: true,
    });
    await handler(RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_EXECUTE)(null, {
      connectionId: 'connection-1',
    });
    await handler(RepositoryChannels.KNOWLEDGE_CONNECTION_SYNC)(null, {
      connectionId: 'connection-1',
    });

    expect(connectionPort.disconnectKnowledgeRepository).toHaveBeenCalledWith('connection-1', true);
    expect(scheduler.refresh).toHaveBeenCalledTimes(4);
    expect(scheduler.refresh).toHaveBeenNthCalledWith(1, 'identity-1');
    expect(mocks.handlers.has('repository:resource:update')).toBe(false);
    expect(mocks.handlers.has('repository:resource:delete')).toBe(false);
    expect(mocks.handlers.has('repository:folder:list')).toBe(false);
    expect(mocks.handlers.has('repository:current')).toBe(false);

    await module.destroy?.();
    module = null;

    expect(scheduler.stop).toHaveBeenCalledWith({ commitPendingChanges: true });
    expect(mocks.removeHandler).toHaveBeenCalledWith(RepositoryChannels.KNOWLEDGE_CONNECTION_SYNC);
  });
});
