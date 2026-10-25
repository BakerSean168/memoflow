import { describe, expect, it } from 'vitest';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  createPublicFailure,
  defineFailureHttpPolicy,
  defineFailureRegistry,
  fail,
  ok,
  publicFailureToHttpStatus,
  toLegacyResultError,
} from './index';
import { fromHttpResponse, toHttpResponse } from './http';
import { fromIpcResult, isIpcResultEnvelope, toIpcResult } from './ipc';

const TransportFailureRegistry = defineFailureRegistry({
  TEST_CONFLICT: {
    category: FailureCategories.Conflict,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'not_retryable' },
    telemetry: 'test_conflict',
  },
  TEST_UNAVAILABLE: {
    category: FailureCategories.Unavailable,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'transient' },
    telemetry: 'test_unavailable',
  },
});

const TransportFailureHttpPolicy = defineFailureHttpPolicy(TransportFailureRegistry, {
  TEST_CONFLICT: { status: 412 },
  TEST_UNAVAILABLE: { status: 503 },
});

describe('result transport context support', () => {
  it('omits undefined optional detail values from IPC while preserving real values', () => {
    const withoutValue = toIpcResult(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'invalid',
        details: [{ field: 'body.name', code: 'INVALID_FIELD', message: 'required' }],
      }),
    );
    expect(withoutValue.error?.details).toEqual([
      { field: 'body.name', code: 'INVALID_FIELD', message: 'required' },
    ]);

    const withValue = toIpcResult(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'invalid',
        details: [{ field: 'body.age', code: 'INVALID_FIELD', message: 'invalid', value: 17 }],
      }),
    );
    expect(withValue.error?.details).toEqual([
      { field: 'body.age', code: 'INVALID_FIELD', message: 'invalid', value: 17 },
    ]);
  });
  it('preserves error context through HTTP conversion', () => {
    const result = fail({
      code: 'CONFLICT',
      message: 'Multiple repositories found',
      context: {
        count: 2,
        repositoryIds: ['repo-1', 'repo-2'],
      },
    });

    const http = toHttpResponse(result);
    const restored = fromHttpResponse(http);

    expect(http.error?.context).toEqual({
      count: 2,
      repositoryIds: ['repo-1', 'repo-2'],
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.error.context).toEqual({
        count: 2,
        repositoryIds: ['repo-1', 'repo-2'],
      });
    }
  });

  it('preserves error context through IPC conversion', () => {
    const result = fail({
      code: 'CONFLICT',
      message: 'Multiple repositories found',
      context: {
        count: 2,
        repositoryIds: ['repo-1', 'repo-2'],
      },
    });

    const ipc = toIpcResult(result);
    const restored = fromIpcResult(ipc);

    expect(ipc.error?.context).toEqual({
      count: 2,
      repositoryIds: ['repo-1', 'repo-2'],
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.error.context).toEqual({
        count: 2,
        repositoryIds: ['repo-1', 'repo-2'],
      });
    }
  });

  it('preserves success without data through HTTP conversion', () => {
    const result = ok(undefined);

    const http = toHttpResponse(result);
    const restored = fromHttpResponse(http);

    expect(http.ok).toBe(true);
    expect(http.data).toBeUndefined();
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.data).toBeUndefined();
    }
  });

  it('preserves success without data through IPC conversion', () => {
    const result = ok(undefined);

    const ipc = toIpcResult(result);
    const restored = fromIpcResult(ipc);

    expect(ipc.ok).toBe(true);
    expect(ipc.data).toBeUndefined();
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.data).toBeUndefined();
    }
  });

  it('preserves typed public failure semantics through HTTP and IPC without cause leakage', () => {
    const failure = createPublicFailure(TransportFailureRegistry, 'TEST_UNAVAILABLE', {});
    const result = fail({
      ...toLegacyResultError(failure, 'Service temporarily unavailable'),
      cause: new Error('private provider failure'),
    });

    const http = toHttpResponse(result);
    const restoredHttp = fromHttpResponse(http);
    const ipc = toIpcResult(result);
    const restoredIpc = fromIpcResult(ipc);

    expect(http.code).toBe(503);
    expect(http.error?.failure).toEqual(failure);
    expect(ipc.error?.failure).toEqual(failure);
    expect(http.error).not.toHaveProperty('cause');
    expect(ipc.error).not.toHaveProperty('cause');

    expect(restoredHttp.ok).toBe(false);
    if (!restoredHttp.ok) {
      expect(restoredHttp.error.failure).toEqual(failure);
      expect(restoredHttp.error.cause).toBeUndefined();
    }
    expect(restoredIpc.ok).toBe(false);
    if (!restoredIpc.ok) {
      expect(restoredIpc.error.failure).toEqual(failure);
      expect(restoredIpc.error.cause).toBeUndefined();
    }
  });

  it('uses category defaults unless an operation HTTP policy overrides the code', () => {
    const conflict = createPublicFailure(TransportFailureRegistry, 'TEST_CONFLICT', {});
    const unavailable = createPublicFailure(TransportFailureRegistry, 'TEST_UNAVAILABLE', {});

    expect(publicFailureToHttpStatus(conflict)).toBe(409);
    expect(publicFailureToHttpStatus(conflict, TransportFailureHttpPolicy)).toBe(412);
    expect(publicFailureToHttpStatus(unavailable, TransportFailureHttpPolicy)).toBe(503);
  });

  it('rejects raw dual-track IPC payloads that only carry a business ok flag', () => {
    expect(isIpcResultEnvelope({ ok: true, authenticated: false })).toBe(false);
    expect(isIpcResultEnvelope({ ok: false, hasValidSession: false })).toBe(false);

    const failEnvelope = toIpcResult(
      fail({
        code: 'UNAUTHORIZED',
        message: '未授权，请登录',
      }),
    );
    expect(isIpcResultEnvelope(failEnvelope)).toBe(true);
    const restored = fromIpcResult(failEnvelope);
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.error.code).toBe('UNAUTHORIZED');
    }
  });
});
