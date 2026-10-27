/**
 * IPC Adapter Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { ipcAdapter, ipcAdapterWithValidation } from './ipc-adapter';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  ResultErrorException,
  createPublicFailure,
  defineFailureRegistry,
  fail,
  ok,
} from '@memoflow/transport-contracts/result';
import type { ExecutionContext, RequestContext } from '@memoflow/transport-contracts';

const AdapterFailureRegistry = defineFailureRegistry({
  TEST_PROVIDER_UNAVAILABLE: {
    category: FailureCategories.Unavailable,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'transient' },
    telemetry: 'provider_unavailable',
  },
});

// ============================================================================
// Mock helpers
// ============================================================================

function createMockEvent() {
  return { sender: {}, senderFrame: {} };
}

const CARRIER: RequestContext = {
  requestId: 'req-ipc-1',
  traceId: 'req-ipc-1',
  startedAt: 1_700_000_000_000,
  source: 'ipc',
};

function fullContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    ...CARRIER,
    identityId: 'desktop-user',
    deviceId: 'desktop-mac',
    ...overrides,
  };
}

function createMockSchema(data: unknown, shouldFail = false) {
  return {
    safeParse: (_input: unknown) => {
      if (shouldFail) {
        return {
          success: false as const,
          error: {
            issues: [{ path: ['title'], message: 'Required' }],
          },
        };
      }
      return { success: true as const, data };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ipcAdapter', () => {
  it('should call controller with the full canonical context and return IpcResult on success', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1', name: 'Test' }));
    const handler = ipcAdapter(controllerFn, {
      extractContext: () => fullContext(),
    });

    const event = createMockEvent();
    const result = await handler(event, { id: '1' });

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'desktop-user',
      deviceId: 'desktop-mac',
      requestId: 'req-ipc-1',
      traceId: 'req-ipc-1',
      startedAt: 1_700_000_000_000,
      source: 'ipc',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: '1', name: 'Test' });
  });

  it('should return IpcResult on controller failure', async () => {
    const controllerFn = vi.fn().mockResolvedValue(
      fail({
        code: 'NOT_FOUND',
        message: 'Not found',
        context: { entity: 'repository', id: 'repo-1' },
      }),
    );
    const handler = ipcAdapter(controllerFn, { extractContext: () => fullContext() });

    const result = await handler(createMockEvent(), { id: '999' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(result.error?.message).toBe('Not found');
    expect(result.error?.context).toEqual({ entity: 'repository', id: 'repo-1' });
  });

  it('should keep unknown thrown-error details internal', async () => {
    const cause = new Error('DB connection lost');
    const controllerFn = vi.fn().mockRejectedValue(cause);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = ipcAdapter(controllerFn, { extractContext: () => fullContext() });

    const result = await handler(createMockEvent(), {});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(result.error?.message).toBe('Internal operation failed');
    expect(result.error?.message).not.toContain('DB connection lost');
    expect(consoleError).toHaveBeenCalledWith('[ipcAdapter] Unhandled error:', cause);
    consoleError.mockRestore();
  });

  it('should use custom context extractor returning the full shape', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('ok'));
    const handler = ipcAdapter(controllerFn, {
      extractContext: () => fullContext({ identityId: 'desktop-user', deviceId: 'desktop-mac' }),
    });

    await handler(createMockEvent(), {});

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'desktop-user',
      deviceId: 'desktop-mac',
      requestId: 'req-ipc-1',
      traceId: 'req-ipc-1',
      source: 'ipc',
    });
  });

  it('should fail closed with no context producer (no identity-only stub)', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('ok'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = ipcAdapter(controllerFn);

    const result = await handler(createMockEvent(), {});

    expect(controllerFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(consoleError).toHaveBeenCalledWith('[ipcAdapter] Unhandled error:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('should preserve domain error context when controller throws', async () => {
    const controllerFn = vi
      .fn()
      .mockRejectedValue(
        new ResultErrorException(
          'Multiple repositories found',
          'CONFLICT',
          undefined,
          { count: 2, repositoryIds: ['repo-1'] },
          409,
        ),
      );
    const handler = ipcAdapter(controllerFn, { extractContext: () => fullContext() });

    const result = await handler(createMockEvent(), {});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
    expect(result.error?.context).toEqual({
      count: 2,
      repositoryIds: ['repo-1'],
    });
  });

  it('should preserve structured result errors thrown by the controller', async () => {
    const controllerFn = vi
      .fn()
      .mockRejectedValue(
        new ResultErrorException(
          'Forbidden',
          'FORBIDDEN',
          [{ code: 'MISSING_ROLE', message: 'admin required' }],
          { source: 'ipc-spec' },
          403,
        ),
      );
    const handler = ipcAdapter(controllerFn, { extractContext: () => fullContext() });

    const result = await handler(createMockEvent(), {});

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden',
        details: [{ code: 'MISSING_ROLE', message: 'admin required' }],
        context: { source: 'ipc-spec' },
      },
    });
  });

  it('preserves typed public failure semantics and drops internal causes', async () => {
    const failure = createPublicFailure(AdapterFailureRegistry, 'TEST_PROVIDER_UNAVAILABLE', {});
    const controllerFn = vi
      .fn()
      .mockRejectedValue(
        new ResultErrorException(
          'Provider unavailable',
          failure.code,
          undefined,
          undefined,
          undefined,
          new Error('private provider body'),
          failure,
        ),
      );
    const handler = ipcAdapter(controllerFn, { extractContext: () => fullContext() });

    const result = await handler(createMockEvent(), {});

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'TEST_PROVIDER_UNAVAILABLE',
        message: 'Provider unavailable',
        details: undefined,
        context: undefined,
        failure,
      },
    });
    expect(result.error).not.toHaveProperty('cause');
  });
});

describe('ipcAdapterWithValidation', () => {
  it('should validate args and call controller on success', async () => {
    const inputData = { title: 'New Goal' };
    const schema = createMockSchema(inputData);
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1', title: 'New Goal' }));

    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
    });
    const result = await handler(createMockEvent(), inputData);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'desktop-user',
      requestId: 'req-ipc-1',
      source: 'ipc',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: '1', title: 'New Goal' });
  });

  it('should return validation error when schema fails', async () => {
    const schema = createMockSchema(null, true);
    const controllerFn = vi.fn();

    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
    });
    const result = await handler(createMockEvent(), {});

    expect(controllerFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect(result.error?.details).toHaveLength(1);
    expect(result.error?.details?.[0]).toEqual({
      field: 'title',
      code: 'INVALID_FIELD',
      message: 'Required',
    });
  });

  it('should handle controller failure result', async () => {
    const schema = createMockSchema({ title: 'Test' });
    const controllerFn = vi
      .fn()
      .mockResolvedValue(fail({ code: 'CONFLICT', message: 'Already exists' }));

    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
    });
    const result = await handler(createMockEvent(), { title: 'Test' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });

  it('should handle thrown errors gracefully', async () => {
    const schema = createMockSchema({ title: 'Test' });
    const controllerFn = vi.fn().mockRejectedValue(new Error('Crash'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
    });
    const result = await handler(createMockEvent(), { title: 'Test' });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(result.error?.message).toBe('Internal operation failed');
    expect(result.error?.message).not.toContain('Crash');
    expect(consoleError).toHaveBeenCalledWith(
      '[ipcAdapterWithValidation] Unhandled error:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('validates the projected canonical input when projectArgs is provided', async () => {
    const inputData = { goalId: 'goal-1', body: { title: 'New' } };
    const schema = createMockSchema(inputData);
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1' }));

    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
      projectArgs: (args) => ({ goalId: args, body: { title: 'New' } }),
    });
    const result = await handler(createMockEvent(), 'goal-1');

    expect(result.ok).toBe(true);
    const received = controllerFn.mock.calls[0][0];
    expect(received).toEqual(inputData);
  });

  it('returns VALIDATION_ERROR on projected canonical input failure before controller', async () => {
    const schema = createMockSchema(null, true);
    const controllerFn = vi.fn();

    const handler = ipcAdapterWithValidation(schema, controllerFn, {
      extractContext: () => fullContext(),
      projectArgs: (args) => ({ id: args }),
    });
    const result = await handler(createMockEvent(), 'bad-id');

    expect(controllerFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
