import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  ResultErrorException,
  createPublicFailure,
  defineFailureRegistry,
} from '@memoflow/transport-contracts/result';
import { applyErrorHandlers } from './error';
import { CorsRejectionError } from './global';
import { createRequestContextMiddleware } from '../http/middlewares/request-context.middleware';
import { createAuthMiddleware } from '../http/middlewares/auth-middleware';

const MiddlewareFailureRegistry = defineFailureRegistry({
  TEST_PROVIDER_UNAVAILABLE: {
    category: FailureCategories.Unavailable,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'transient' },
    telemetry: 'provider_unavailable',
  },
});

function createAppWithError(error: Error) {
  const app = express();

  app.get('/boom', (_req, _res, next) => {
    next(error);
  });

  applyErrorHandlers(app);

  return app;
}

function createAppWith404() {
  const app = express();
  applyErrorHandlers(app);
  return app;
}

describe('applyErrorHandlers (residual 627)', () => {
  it('maps unknown routes to 404 HttpResponse NOT_FOUND envelope', async () => {
    const app = createAppWith404();

    const res = await request(app).get('/missing');

    expect(res.status).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        code: 404,
        message: 'Not Found',
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'Not Found',
        }),
        timestamp: expect.any(Number),
      }),
    );
    expect(res.body).not.toHaveProperty('success');
  });

  it('maps CORS rejections to 403 HttpResponse FORBIDDEN envelope', async () => {
    const app = createAppWithError(new CorsRejectionError('https://blocked.example'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        code: 403,
        message: 'Not allowed by CORS',
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Not allowed by CORS',
        }),
        timestamp: expect.any(Number),
      }),
    );
  });

  it('keeps unexpected errors as 500 HttpResponse INTERNAL_ERROR envelope', async () => {
    const app = createAppWithError(new Error('boom'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        code: 500,
        message: 'Internal server error',
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        }),
        timestamp: expect.any(Number),
      }),
    );
  });

  it('preserves structured result errors as HttpResponse envelope', async () => {
    const app = createAppWithError(
      new ResultErrorException(
        'Access denied',
        'FORBIDDEN',
        [{ code: 'MISSING_ROLE', message: 'admin required' }],
        { source: 'middleware-spec' },
        403,
      ),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        code: 403,
        message: 'Access denied',
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Access denied',
          details: [{ code: 'MISSING_ROLE', message: 'admin required' }],
          context: { source: 'middleware-spec' },
        }),
        timestamp: expect.any(Number),
      }),
    );
  });

  it('projects typed public failures without exposing diagnostic causes', async () => {
    const failure = createPublicFailure(MiddlewareFailureRegistry, 'TEST_PROVIDER_UNAVAILABLE', {});
    const app = createAppWithError(
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

    const res = await request(app).get('/boom');

    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'TEST_PROVIDER_UNAVAILABLE',
      message: 'Provider unavailable',
      failure,
    });
    expect(res.body.error).not.toHaveProperty('cause');
  });
});

describe('applyErrorHandlers + RequestContext (RefArch Phase 2 header echo)', () => {
  function createAppWithRequestContext() {
    const app = express();
    app.use(createRequestContextMiddleware());

    // Simulated auth failure: Cloud Auth resolves no principal → 401.
    const auth = createAuthMiddleware({
      resolveNodePrincipal: async () => null,
    } as never);
    app.get('/protected', auth, (_req, res) => res.json({ ok: true }));

    app.get('/no-content', (_req, res) => {
      res.status(204).end();
    });

    app.get('/boom', (_req, _res, next) => {
      next(new Error('boom'));
    });

    applyErrorHandlers(app);
    return app;
  }

  it('echoes the same X-Request-Id header and traceId body across auth 401, 404 and global 500', async () => {
    const app = createAppWithRequestContext();
    const clientRequestId = 'client-abc-123';

    for (const path of ['/protected', '/missing', '/boom']) {
      const res = await request(app).get(path).set('X-Request-Id', clientRequestId);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
      expect(res.headers['x-request-id']).toBe(clientRequestId);
      expect(res.body.traceId).toBe(clientRequestId);
      expect(res.body.ok).toBe(false);
    }
  });

  it('echoes a generated request ID for responses that never passed auth/route', async () => {
    const app = createAppWithRequestContext();
    const res = await request(app).get('/missing');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-/);
    expect(res.body.traceId).toBe(res.headers['x-request-id']);
  });

  it('keeps 204 responses empty while echoing X-Request-Id', async () => {
    const app = createAppWithRequestContext();
    const res = await request(app).get('/no-content');

    expect(res.status).toBe(204);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-/);
    expect(res.text).toBe('');
    expect(res.body).toEqual({});
  });
});
