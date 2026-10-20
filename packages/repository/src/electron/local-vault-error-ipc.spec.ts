import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    error: vi.fn(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    ),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    removeHandler: mocks.removeHandler,
  },
}));

vi.mock('@memoflow/utils/logger', () => ({
  createLogger: () => ({
    error: mocks.error,
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import { createRepositoryElectronModule } from './index';

describe('Local Vault Electron error boundary', () => {
  let module: ReturnType<typeof createRepositoryElectronModule> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  afterEach(async () => {
    await module?.destroy?.();
    module = null;
  });

  it('preserves an unexpected Error for logs but returns a bounded IPC error', async () => {
    const original = new Error('js-yaml compatibility failure');
    const localVaultPort = {
      scanVault: vi.fn(async () => {
        throw original;
      }),
      dispose: vi.fn(async () => undefined),
    };

    const context = {
      db: {},
      auth: {
        getIdentityId: vi.fn(async () => 'identity-1'),
        requireRequestContext: vi.fn(async () => ({ identityId: 'identity-1' })),
      },
    } as unknown as IElectronModuleContext;

    module = createRepositoryElectronModule({ localVaultPort: localVaultPort as never });
    await module.register(context);

    const scanHandler = mocks.handlers.get(RepositoryChannels.LOCAL_VAULT_SCAN);
    expect(scanHandler).toBeDefined();
    const result = await scanHandler!(null);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Local Vault operation failed' },
    });
    expect(mocks.error).toHaveBeenCalledWith('Local Vault operation failed', original);
  });
});
