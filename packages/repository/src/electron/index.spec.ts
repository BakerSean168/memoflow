import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import { ok } from '@memoflow/transport-contracts/result';

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

describe('RepositoryElectronModule local ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });
  it('exposes local read, receipt and confirmed-write IPC without remote synchronization', async () => {
    const localVault = {
      getBinding: vi.fn(async () => null),
      listRecentWrites: vi.fn(async () => []),
      getGitChanges: vi.fn(async () => ({ state: 'ready', changes: [] })),
      writeConfirmedNote: vi.fn(async () => ({ note: { title: 'Saved' } })),
      dispose: vi.fn(async () => undefined),
    };
    const context = {
      auth: {
        getIdentityId: vi.fn(async () => 'identity-1'),
        requireRequestContext: vi.fn(async () => ({ identityId: 'identity-1' })),
      },
    } as unknown as IElectronModuleContext;
    const module = createRepositoryElectronModule({ localVaultPort: localVault as never });
    await module.register(context);
    expect(await handler(RepositoryChannels.LOCAL_VAULT_WRITES)({})).toEqual(ok([]));
    expect(await handler(RepositoryChannels.LOCAL_VAULT_GIT_CHANGES)({})).toEqual(
      ok({ state: 'ready', changes: [] }),
    );
    expect(
      await handler(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED)({}, { confirmed: true }),
    ).toEqual(ok({ note: { title: 'Saved' } }));
    expect(localVault.writeConfirmedNote).toHaveBeenCalledWith({ confirmed: true });
    expect(
      [...mocks.handlers.keys()].every((channel) => channel.startsWith('repository:local-vault:')),
    ).toBe(true);
    await module.destroy?.();
    expect(mocks.handlers.size).toBe(0);
    expect(localVault.dispose).toHaveBeenCalledTimes(1);
  });
});
