/**
 * Route Registrar Tests
 *
 * Verifies that `route()` binds `expressAdapter` and `routeWithValidation()`
 * binds `expressAdapterWithValidation` against the same schema object used by
 * the OpenAPI registration — the single source of truth for runtime validation
 * and generated documentation.
 *
 * 验证 `route()` 绑定 `expressAdapter`，而 `routeWithValidation()` 绑定
 * `expressAdapterWithValidation` 且与 OpenAPI 注册使用同一个 schema 对象——
 * runtime 校验与生成文档的唯一事实来源。
 */
import { describe, expect, it, vi } from 'vitest';
import { RouteRegistrar } from './route-registrar';
import type { ExpressLikeRequest } from './express-adapter';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext, RequestContext } from '@memoflow/transport-contracts';
import { z } from 'zod';

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

function createMockRouter() {
  const calls: Array<{ method: string; path: string; handlers: unknown[] }> = [];
  return {
    get: (path: string, ...handlers: unknown[]) => {
      calls.push({ method: 'get', path, handlers });
    },
    post: (path: string, ...handlers: unknown[]) => {
      calls.push({ method: 'post', path, handlers });
    },
    put: (path: string, ...handlers: unknown[]) => {
      calls.push({ method: 'put', path, handlers });
    },
    patch: (path: string, ...handlers: unknown[]) => {
      calls.push({ method: 'patch', path, handlers });
    },
    delete: (path: string, ...handlers: unknown[]) => {
      calls.push({ method: 'delete', path, handlers });
    },
    calls,
  };
}

class TestRegistry {
  readonly paths: Array<Record<string, unknown>> = [];
  registerPath(route: Record<string, unknown>): void {
    this.paths.push(route);
  }
  register(): void {}
}

function createMockRes() {
  const res: any = {
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

function createMockReq(overrides: Record<string, unknown> = {}): ExpressLikeRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { identityId: 'user-1', sessionId: 'session-1' },
    requestContext: CARRIER,
    ...overrides,
  };
}

const CreateSchema = z.object({ name: z.string().min(1) }).strict();

describe('RouteRegistrar', () => {
  it('route() registers the OpenAPI path and binds expressAdapter', () => {
    const router = createMockRouter();
    const registry = new TestRegistry();
    const registrar = new RouteRegistrar(router as never, registry, {
      basePath: '/api/v1/goals',
      defaultTags: ['Goal'],
    });
    const handler = vi.fn(async (_req: ExpressLikeRequest, _ctx: ExecutionContext) =>
      ok({ id: '1' }),
    );

    registrar.route(
      {
        method: 'post',
        path: '/',
        request: { body: { content: { 'application/json': { schema: CreateSchema } } } },
        responses: { 201: { description: 'created' } },
      },
      [],
      handler as never,
      { successStatus: 201 },
    );

    expect(registry.paths).toHaveLength(1);
    expect(registry.paths[0].method).toBe('post');
    expect(registry.paths[0].path).toBe('/api/v1/goals');
    expect(router.calls).toHaveLength(1);
    expect(router.calls[0].method).toBe('post');
  });

  it('routeWithValidation() validates the OpenAPI-bound schema before the controller', async () => {
    const router = createMockRouter();
    const registry = new TestRegistry();
    const registrar = new RouteRegistrar(router as never, registry, {
      basePath: '/api/v1/goals',
      defaultTags: ['Goal'],
    });
    const controllerFn = vi.fn(async (_data: unknown, _ctx: ExecutionContext) => ok({ id: '1' }));

    registrar.routeWithValidation(
      {
        method: 'post',
        path: '/',
        request: { body: { content: { 'application/json': { schema: CreateSchema } } } },
        responses: { 201: { description: 'created' } },
        validation: { schema: CreateSchema },
      },
      [],
      controllerFn as never,
      { successStatus: 201 },
    );

    // OpenAPI path registered
    expect(registry.paths).toHaveLength(1);
    expect(registry.paths[0].request).toBeDefined();
    const handler = router.calls[0].handlers[0] as (
      req: ExpressLikeRequest,
      res: never,
    ) => Promise<void>;

    // Valid body reaches the controller with parsed data
    const validReq = createMockReq({ body: { name: 'Test' } });
    const validRes = createMockRes();
    await handler(validReq, validRes);
    expect(controllerFn).toHaveBeenCalledTimes(1);
    expect(controllerFn.mock.calls[0][0]).toEqual({ name: 'Test' });
    expect(validRes.statusCode).toBe(201);

    // Invalid body is rejected before the controller
    const invalidReq = createMockReq({ body: { name: '' } });
    const invalidRes = createMockRes();
    await handler(invalidReq, invalidRes);
    expect(controllerFn).toHaveBeenCalledTimes(1);
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('routeWithValidation() projects composite params/body input into the contract schema', async () => {
    const router = createMockRouter();
    const registrar = new RouteRegistrar(router as never, null, {
      basePath: '/api/v1/goals',
    });
    const controllerFn = vi.fn(async (_data: unknown, _ctx: ExecutionContext) => ok(null));

    const InvocationSchema = z.object({
      params: z.object({ id: z.string() }),
      body: CreateSchema,
    });

    registrar.routeWithValidation(
      {
        method: 'put',
        path: '/:id',
        validation: {
          schema: InvocationSchema,
          projectInput: (req) => ({ params: req.params, body: req.body }),
        },
      },
      [],
      controllerFn as never,
    );

    const handler = router.calls[0].handlers[0] as (
      req: ExpressLikeRequest,
      res: never,
    ) => Promise<void>;
    const res = createMockRes();
    await handler(createMockReq({ params: { id: 'goal-1' }, body: { name: 'X' } }), res);
    expect(controllerFn).toHaveBeenCalledTimes(1);
    expect(controllerFn.mock.calls[0][0]).toEqual({
      params: { id: 'goal-1' },
      body: { name: 'X' },
    });
  });

  it('routeWithValidation() can bind a custom projectInput', async () => {
    const router = createMockRouter();
    const registrar = new RouteRegistrar(router as never, null, {
      basePath: '/api/v1/goals',
    });
    const controllerFn = vi.fn(async (_data: unknown, _ctx: ExecutionContext) => ok(null));

    registrar.routeWithValidation(
      {
        method: 'patch',
        path: '/:id',
        validation: {
          schema: z.object({ id: z.string(), name: z.string() }),
          projectInput: (req) => ({
            id: req.params?.id,
            name: (req.body as { name?: string })?.name,
          }),
        },
      },
      [],
      controllerFn as never,
    );

    const handler = router.calls[0].handlers[0] as (
      req: ExpressLikeRequest,
      res: never,
    ) => Promise<void>;
    const res = createMockRes();
    await handler(createMockReq({ params: { id: 'g1' }, body: { name: 'X' } }), res);
    expect(controllerFn).toHaveBeenCalledTimes(1);
    expect(controllerFn.mock.calls[0][0]).toEqual({ id: 'g1', name: 'X' });
  });

  it('skipOpenApi routes are not registered in the OpenAPI registry', () => {
    const router = createMockRouter();
    const registry = new TestRegistry();
    const registrar = new RouteRegistrar(router as never, registry, {
      basePath: '/api/v1/goals',
    });
    const handler = vi.fn(async (_d: unknown, _c: ExecutionContext) => ok(null) as Result<null>);

    registrar.routeWithValidation(
      {
        method: 'patch',
        path: '/:id',
        skipOpenApi: true,
        validation: { schema: z.object({}) },
      },
      [],
      handler as never,
    );

    expect(registry.paths).toHaveLength(0);
  });
});
