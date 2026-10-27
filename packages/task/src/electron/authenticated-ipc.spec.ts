import { describe, expect, it, vi } from 'vitest';

import { ElectronAuthResolutionError } from '@memoflow/desktop-contracts';
import type { IElectronModuleContext } from '@memoflow/desktop-contracts';

import { withAuthenticatedValue } from './authenticated-ipc';

function createContext(overrides?: {
  requireRequestContext?: () => Promise<{ identityId: string; deviceId: string }>;
}): IElectronModuleContext {
  return {
    db: {} as IElectronModuleContext['db'],
    auth: {
      requireRequestContext:
        overrides?.requireRequestContext ??
        vi.fn().mockResolvedValue({ identityId: 'IdentityId_test', deviceId: 'desktop-app' }),
    },
  } as IElectronModuleContext;
}

describe('withAuthenticatedValue', () => {
  it('returns handler result when auth context resolves', async () => {
    const ctx = createContext();

    const result = await withAuthenticatedValue(ctx, async (requestContext) => ({
      id: requestContext.identityId,
    }));

    expect(result).toEqual({ ok: true, data: { id: 'IdentityId_test' } });
  });

  it('returns AUTH_RESTORING when auth restoration is in progress', async () => {
    const ctx = createContext({
      requireRequestContext: vi
        .fn()
        .mockRejectedValue(new ElectronAuthResolutionError('AUTH_RESTORING')),
    });

    const result = await withAuthenticatedValue(ctx, async () => ({ id: 'ignored' }));

    expect(result).toEqual({
      ok: false,
      error: { code: 'AUTH_RESTORING', message: 'Authentication restore in progress' },
    });
  });

  it('returns AUTH_REQUIRED when auth context is unavailable', async () => {
    const ctx = createContext({
      requireRequestContext: vi
        .fn()
        .mockRejectedValue(new ElectronAuthResolutionError('AUTH_REQUIRED')),
    });

    const result = await withAuthenticatedValue(ctx, async () => ({ id: 'ignored' }));

    expect(result).toEqual({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
  });

  it('returns INTERNAL_ERROR for non-auth exceptions', async () => {
    const ctx = createContext();

    const result = await withAuthenticatedValue(ctx, async () => {
      throw new Error('task module boot failure');
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal task IPC error' },
    });
  });
});
