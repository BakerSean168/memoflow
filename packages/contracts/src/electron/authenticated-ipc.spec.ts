import { describe, expect, it, vi } from 'vitest';
import type { IElectronModuleContext } from './index';
import { createAuthenticatedIpcWrapper } from './authenticated-ipc';
import { ElectronAuthResolutionError } from './auth-context';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '../shared';

function executionContext(identityId: string): ExecutionContext {
  return {
    requestId: 'req-ipc-test',
    traceId: 'req-ipc-test',
    startedAt: 1_700_000_000_000,
    source: 'ipc',
    identityId,
    deviceId: 'desktop-app',
  };
}

function createContext(overrides?: {
  requireRequestContext?: () => Promise<ExecutionContext>;
}): IElectronModuleContext {
  return {
    db: {} as IElectronModuleContext['db'],
    auth: {
      requireRequestContext:
        overrides?.requireRequestContext ??
        vi.fn().mockResolvedValue(executionContext('IdentityId_test')),
    },
  } as IElectronModuleContext;
}

describe('createAuthenticatedIpcWrapper', () => {
  it('maps explicit auth resolution errors to auth result codes', async () => {
    const ctx = createContext({
      requireRequestContext: vi
        .fn()
        .mockRejectedValue(new ElectronAuthResolutionError('AUTH_REQUIRED')),
    });

    const withAuthenticatedValue = createAuthenticatedIpcWrapper();
    const result = await withAuthenticatedValue(ctx, async () => ({ id: 'ignored' }));

    expect(result).toEqual({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
    });
  });

  it('treats generic exceptions as internal errors by default', async () => {
    const ctx = createContext();
    const withAuthenticatedValue = createAuthenticatedIpcWrapper();

    const result = await withAuthenticatedValue(ctx, async () => {
      throw new Error('repository boot failure');
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal IPC error' },
    });
  });

  it('preserves structured result errors thrown by handlers', async () => {
    const ctx = createContext();
    const withAuthenticatedValue = createAuthenticatedIpcWrapper();

    const result = await withAuthenticatedValue(ctx, async () => {
      throw new ResultErrorException(
        'Access denied',
        'FORBIDDEN',
        [{ code: 'MISSING_ROLE', message: 'admin required' }],
        { source: 'spec' },
        403,
      );
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
        details: [{ code: 'MISSING_ROLE', message: 'admin required' }],
        context: { source: 'spec' },
      },
    });
  });

  it('does not infer auth state from arbitrary error messages', async () => {
    const ctx = createContext({
      requireRequestContext: vi.fn().mockRejectedValue(new Error('AUTH_REQUIRED')),
    });

    const withAuthenticatedValue = createAuthenticatedIpcWrapper();
    const result = await withAuthenticatedValue(ctx, async () => ({ id: 'ignored' }));

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal IPC error' },
    });
  });
});
