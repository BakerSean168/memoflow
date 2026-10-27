/**
 * Express Adapter Tests
 */
import { describe, it, expect, vi } from 'vitest';
import {
  expressAdapter,
  expressAdapterWithValidation,
  formatZodErrors,
  type ExpressLikeRequest,
} from './express-adapter';
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

const CARRIER: RequestContext = {
  requestId: 'req-1',
  traceId: 'req-1',
  startedAt: 1_700_000_000_000,
  source: 'http',
};

function fullContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    ...CARRIER,
    identityId: 'user-1',
    deviceId: 'unknown',
    ...overrides,
  };
}

function createMockReq(overrides: Record<string, unknown> = {}): ExpressLikeRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { identityId: 'user-1', sessionId: 'session-1' },
    requestContext: CARRIER,
    traceId: CARRIER.traceId,
    startTime: CARRIER.startedAt,
    ...overrides,
  };
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
  end(): MockResponse;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: null,
    ended: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

function createMockSchema(data: unknown, shouldFail = false) {
  return {
    safeParse: (_input: unknown) => {
      if (shouldFail) {
        return {
          success: false as const,
          error: {
            issues: [
              { path: ['name'], message: 'Required' },
              { path: ['nested', 'field'], message: 'Invalid' },
            ],
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

describe('formatZodErrors', () => {
  it('should format Zod issues into ResultErrorDetail array', () => {
    const issues = [
      { path: ['name'], message: 'Required' },
      { path: ['address', 'city'], message: 'Too short' },
    ];

    const result = formatZodErrors(issues);

    expect(result).toEqual([
      { field: 'name', code: 'INVALID_FIELD', message: 'Required' },
      { field: 'address.city', code: 'INVALID_FIELD', message: 'Too short' },
    ]);
  });

  it('should handle empty issues array', () => {
    expect(formatZodErrors([])).toEqual([]);
  });
});

describe('expressAdapter', () => {
  it('should call controller with the full canonical context and return success response', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1', name: 'Test' }));
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'user-1',
      deviceId: 'unknown',
      requestId: 'req-1',
      traceId: 'req-1',
      startedAt: 1_700_000_000_000,
      source: 'http',
    });
    expect(received.device).toBeDefined();
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toEqual({ id: '1', name: 'Test' });
    expect(res.body.traceId).toBe('req-1');
    expect(res.body.duration).toBeGreaterThanOrEqual(0);
  });

  it('should use custom successStatus', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1' }));
    const handler = expressAdapter(controllerFn, { successStatus: 201 });

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
  });

  it('should send empty 204 No Content without JSON body (residual 108)', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok(null));
    const handler = expressAdapter(controllerFn, { successStatus: 204 });

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeNull();
  });

  it('should return 401 when user is not authenticated and requireAuth is true', async () => {
    const controllerFn = vi.fn();
    const handler = expressAdapter(controllerFn, { requireAuth: true });

    const req = createMockReq({ user: undefined });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.traceId).toBe('req-1');
  });

  it('should skip auth check when requireAuth is false', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('public-data'));
    const handler = expressAdapter(controllerFn, { requireAuth: false });

    const req = createMockReq({ user: undefined });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('should handle controller failure result', async () => {
    const controllerFn = vi.fn().mockResolvedValue(
      fail({
        code: 'NOT_FOUND',
        message: 'Goal not found',
        context: { entity: 'goal', id: 'goal-1' },
      }),
    );
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.context).toEqual({ entity: 'goal', id: 'goal-1' });
  });

  it('should handle thrown errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controllerFn = vi.fn().mockRejectedValue(new Error('Database error'));
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    try {
      await handler(req, res);
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it('should use custom context extractor returning the full shape', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('ok'));
    const handler = expressAdapter(controllerFn, {
      extractContext: () => fullContext({ identityId: 'custom-id', deviceId: 'mobile' }),
    });

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'custom-id',
      deviceId: 'mobile',
      requestId: 'req-1',
      traceId: 'req-1',
      source: 'http',
    });
  });

  it('mints a canonical fallback carrier when the global RequestContext middleware was not mounted', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('ok'));
    const handler = expressAdapter(controllerFn);

    const req = createMockReq({ requestContext: undefined, traceId: undefined, id: undefined });
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received.identityId).toBe('user-1');
    expect(received.requestId).toEqual(expect.any(String));
    expect(received.traceId).toBe(received.requestId);
    expect(received.startedAt).toEqual(expect.any(Number));
    expect(received.source).toBe('http');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.traceId).toBe(received.requestId);
  });

  it('reuses legacy req.id as the fallback requestId when the carrier is missing', async () => {
    const controllerFn = vi.fn().mockResolvedValue(ok('ok'));
    const handler = expressAdapter(controllerFn);

    const req = createMockReq({
      requestContext: undefined,
      traceId: undefined,
      id: 'legacy-id',
      startTime: 1_600_000_000_000,
    });
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received.requestId).toBe('legacy-id');
    expect(received.traceId).toBe('legacy-id');
    expect(received.startedAt).toBe(1_600_000_000_000);
  });

  it('should preserve domain error context in error responses', async () => {
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
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.context).toEqual({
      count: 2,
      repositoryIds: ['repo-1'],
    });
  });

  it('should preserve structured result errors thrown by the controller', async () => {
    const controllerFn = vi
      .fn()
      .mockRejectedValue(
        new ResultErrorException(
          'Access denied',
          'FORBIDDEN',
          [{ code: 'MISSING_ROLE', message: 'admin required' }],
          { source: 'express-spec' },
          403,
        ),
      );
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toEqual({
      code: 'FORBIDDEN',
      message: 'Access denied',
      details: [{ code: 'MISSING_ROLE', message: 'admin required' }],
      context: { source: 'express-spec' },
      failure: undefined,
    });
  });

  it('uses typed failure category for HTTP status and never serializes the cause', async () => {
    const failure = createPublicFailure(AdapterFailureRegistry, 'TEST_PROVIDER_UNAVAILABLE', {});
    const controllerFn = vi.fn().mockResolvedValue(
      fail({
        code: failure.code,
        message: 'Provider unavailable',
        failure,
        cause: new Error('private provider body'),
      }),
    );
    const handler = expressAdapter(controllerFn);

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toEqual({
      code: 'TEST_PROVIDER_UNAVAILABLE',
      message: 'Provider unavailable',
      details: undefined,
      context: undefined,
      failure,
    });
    expect(res.body.error).not.toHaveProperty('cause');
  });
});

describe('expressAdapterWithValidation', () => {
  it('should validate body and call controller on success', async () => {
    const inputData = { name: 'Test Goal' };
    const schema = createMockSchema(inputData);
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1', name: 'Test Goal' }));
    const handler = expressAdapterWithValidation(schema, controllerFn);

    const req = createMockReq({ body: inputData });
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][1] as ExecutionContext;
    expect(received).toMatchObject({
      identityId: 'user-1',
      deviceId: 'unknown',
      requestId: 'req-1',
      traceId: 'req-1',
      source: 'http',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should return 400 when validation fails', async () => {
    const schema = createMockSchema(null, true);
    const controllerFn = vi.fn();
    const handler = expressAdapterWithValidation(schema, controllerFn);

    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.details).toHaveLength(2);
    expect(res.body.error.details[0]).toEqual({
      field: 'name',
      code: 'INVALID_FIELD',
      message: 'Required',
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    const schema = createMockSchema({ name: 'Test' });
    const controllerFn = vi.fn();
    const handler = expressAdapterWithValidation(schema, controllerFn);

    const req = createMockReq({ body: { name: 'Test' }, user: undefined });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('should pass req to controller for accessing params', async () => {
    const schema = createMockSchema({ title: 'Updated' });
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: 'goal-1', title: 'Updated' }));
    const handler = expressAdapterWithValidation(schema, controllerFn);

    const req = createMockReq({
      body: { title: 'Updated' },
      params: { id: 'goal-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    const [, , passedReq] = controllerFn.mock.calls[0];
    expect(passedReq.params.id).toBe('goal-1');
  });

  it('should use custom successStatus', async () => {
    const schema = createMockSchema({ name: 'New' });
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: '1' }));
    const handler = expressAdapterWithValidation(schema, controllerFn, { successStatus: 201 });

    const req = createMockReq({ body: { name: 'New' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
  });

  it('should send empty 204 No Content without JSON body for validated routes (residual 108)', async () => {
    const schema = createMockSchema({});
    const controllerFn = vi.fn().mockResolvedValue(ok(null));
    const handler = expressAdapterWithValidation(schema, controllerFn, { successStatus: 204 });

    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeNull();
  });

  it('should handle controller errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const schema = createMockSchema({ name: 'Test' });
    const controllerFn = vi.fn().mockRejectedValue(new Error('Unexpected'));
    const handler = expressAdapterWithValidation(schema, controllerFn);

    const req = createMockReq({ body: { name: 'Test' } });
    const res = createMockRes();

    try {
      await handler(req, res);
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it('validates the projected composite input when projectInput is provided', async () => {
    const inputData = { params: { id: 'goal-1' }, body: { name: 'Updated' } };
    const schema = createMockSchema(inputData);
    const controllerFn = vi.fn().mockResolvedValue(ok({ id: 'goal-1' }));
    const handler = expressAdapterWithValidation(schema, controllerFn, {
      projectInput: (req) => ({ params: req.params, body: req.body }),
    });

    const req = createMockReq({
      body: { name: 'Updated' },
      params: { id: 'goal-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    const received = controllerFn.mock.calls[0][0];
    expect(received).toEqual(inputData);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 on projected composite input validation failure before controller', async () => {
    const schema = createMockSchema(null, true);
    const controllerFn = vi.fn();
    const handler = expressAdapterWithValidation(schema, controllerFn, {
      projectInput: (req) => ({ params: req.params, body: req.body }),
    });

    const req = createMockReq({ body: {}, params: { id: 'bad' } });
    const res = createMockRes();

    await handler(req, res);

    expect(controllerFn).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
