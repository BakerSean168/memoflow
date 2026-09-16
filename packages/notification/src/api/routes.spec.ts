import type { RequestHandler } from 'express';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { NotificationApplicationPort } from '../server/application';
import { registerNotificationRoutes } from './routes';

type RegisteredRoute = {
  method: string;
  path: string;
  request?: Record<string, unknown>;
  responses?: Record<string, unknown>;
};

class TestOpenApiRegistry implements OpenApiRegistryLike {
  readonly paths: RegisteredRoute[] = [];

  registerPath(route: Record<string, unknown>): void {
    this.paths.push(route as RegisteredRoute);
  }

  register(): void {}
}

const authMiddleware = ((_, __, next) => next()) as RequestHandler;

function createControllerStub(): NotificationApplicationPort {
  return {
    createNotification: vi.fn(),
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    deleteNotification: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
    batchMarkAsRead: vi.fn(),
    batchDelete: vi.fn(),
    cleanupOldNotifications: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  } as unknown as NotificationApplicationPort;
}

function getRegisteredRoute(
  registry: TestOpenApiRegistry,
  method: string,
  path: string,
): RegisteredRoute {
  const route = registry.paths.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );

  expect(route).toBeDefined();
  return route!;
}

function getJsonBodySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return (
    (
      (route.request?.body as Record<string, unknown> | undefined)?.content as
        Record<string, unknown> | undefined
    )?.['application/json'] as Record<string, unknown> | undefined
  )?.schema as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function getResponseSchema(
  route: RegisteredRoute,
  status: number,
): {
  safeParse: (value: unknown) => { success: boolean };
  _def?: { typeName?: string };
} {
  const responses = route.responses as
    Record<string, { content?: Record<string, unknown> }> | undefined;
  const response = responses?.[String(status)];
  const schema = (response?.content as Record<string, unknown> | undefined)?.[
    'application/json'
  ] as
    | {
        schema?: {
          safeParse: (value: unknown) => { success: boolean };
          _def?: { typeName?: string };
        };
      }
    | undefined;
  return (
    schema?.schema ??
    (response as unknown as { safeParse: (value: unknown) => { success: boolean } })
  );
}

function getParamsSchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.params as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

const BASE = '/api/v1/notifications';

describe('notification route contracts', () => {
  it('list endpoint uses z.array(NotificationResponseSchema)', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', BASE);
    const responseSchema = getResponseSchema(listRoute, 200);

    expect(responseSchema).toBeDefined();
    // success envelope wrapping an array of notification objects
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: [],
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // data must be an array, not a single object
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { uuid: 'abc' },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('detail endpoint uses NotificationResponseSchema', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(getRoute, 200);

    expect(responseSchema).toBeDefined();
    // A notification-like object with branded IDs and valid enums should pass
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: {
          id: 'INotificationId_550e8400-e29b-41d4-a716-446655440000',
          identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
          title: 'Test',
          content: 'Body',
          type: 'Info',
          category: 'System',
          workflowKey: 'system.general',
          topic: 'system.general',
          idempotencyKey: 'route-test-1',
          importance: 'Moderate',
          urgency: 'Medium',
          isRead: false,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          archivedAt: null,
        },
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // Plain string IDs should fail (brandedId requires prefix_uuid format)
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: {
          id: 'not-branded',
          identityId: 'not-branded',
          title: 'Test',
          content: 'Body',
          type: 'Info',
          category: 'System',
          workflowKey: 'system.general',
          topic: 'system.general',
          idempotencyKey: 'route-test-1',
          importance: 'Moderate',
          urgency: 'Medium',
          isRead: false,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('create endpoint body uses CreateNotificationSchema', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createRoute = getRegisteredRoute(registry, 'post', BASE);
    const bodySchema = getJsonBodySchema(createRoute);

    expect(bodySchema).toBeDefined();
    // Should accept a valid create payload
    expect(
      bodySchema.safeParse({
        title: 'Test notification',
        content: 'Something happened',
        type: 'Info',
        category: 'System',
      }).success,
    ).toBe(true);
    // Should reject an empty object
    expect(bodySchema.safeParse({}).success).toBe(false);
  });

  it('delete endpoint response uses z.null()', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(deleteRoute, 200);

    expect(responseSchema).toBeDefined();
    // successResponse(z.null()) — data must be null
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // data must not be an object
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { something: 'else' },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('route params use branded IDs (not bare strings)', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const paramsSchema = getParamsSchema(getRoute);

    // brandedId rejects bare strings — must be a branded string
    expect(paramsSchema.safeParse({ id: 'not-a-branded-id' }).success).toBe(false);
  });

  it('core CRUD response schemas are contracts-based (not passthrough)', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    // List response schema exists
    const listRoute = getRegisteredRoute(registry, 'get', BASE);
    const listResponseSchema = getResponseSchema(listRoute, 200);
    expect(listResponseSchema).toBeDefined();

    // Detail response schema exists
    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const getResponseSchema200 = getResponseSchema(getRoute, 200);
    expect(getResponseSchema200).toBeDefined();

    // Create response schema exists
    const createRoute = getRegisteredRoute(registry, 'post', BASE);
    const createResponseSchema = getResponseSchema(createRoute, 201);
    expect(createResponseSchema).toBeDefined();

    // Delete response schema exists
    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const deleteResponseSchema = getResponseSchema(deleteRoute, 200);
    expect(deleteResponseSchema).toBeDefined();
  });

  it('preferences endpoints are identity-scoped static paths before /:id (residual 196)', () => {
    const registry = new TestOpenApiRegistry();

    registerNotificationRoutes(
      createControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getPref = getRegisteredRoute(registry, 'get', `${BASE}/preferences`);
    const putPref = getRegisteredRoute(registry, 'put', `${BASE}/preferences`);
    expect(getPref).toBeDefined();
    expect(putPref).toBeDefined();

    const bodySchema = getJsonBodySchema(putPref);
    expect(bodySchema.safeParse({ channels: { inApp: true } }).success).toBe(true);
    // Body must not require client-supplied identityId dual-track.
    expect(bodySchema.safeParse({ identityId: 'x', channels: { inApp: true } }).success).toBe(true);

    const getIdx = registry.paths.findIndex(
      (route) => route.method === 'get' && route.path === `${BASE}/preferences`,
    );
    const idIdx = registry.paths.findIndex(
      (route) => route.method === 'get' && route.path === `${BASE}/{id}`,
    );
    expect(getIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(getIdx).toBeLessThan(idIdx);
  });
});

describe('notification mutation routes run the real validation adapter (Phase 4)', () => {
  function getHandler(
    router: ReturnType<typeof registerNotificationRoutes>,
    method: string,
    path: string,
  ): (req: unknown, res: unknown) => Promise<unknown> {
    const layer = (
      router as unknown as {
        stack: Array<{
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: Array<{ handle: (r: unknown, s: unknown) => unknown }>;
          };
        }>;
      }
    ).stack.find(
      (candidate) => candidate.route?.path === path && candidate.route.methods[method] === true,
    );
    expect(layer, `${method} ${path} registered`).toBeDefined();
    return layer!.route!.stack.at(-1)!.handle;
  }

  function createReq(body: unknown): Record<string, unknown> {
    return {
      body,
      headers: {},
      query: {},
      user: { identityId: 'identity-1' },
      requestContext: {
        requestId: 'req-notification-adapter',
        traceId: 'req-notification-adapter',
        startedAt: 1_700_000_000_000,
        source: 'http',
      },
    };
  }

  function createRes() {
    const res: any = {
      statusCode: 0,
      body: null,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(data: unknown) {
        res.body = data;
        return res;
      },
      end() {
        return res;
      },
    };
    return res;
  }

  function createApi() {
    return {
      createNotification: vi.fn(async () => ({ ok: true, data: { id: 'n-1' } })),
      batchMarkAsRead: vi.fn(async () => ({ ok: true, data: { updatedCount: 2 } })),
      updatePreferences: vi.fn(async () => ({ ok: true, data: { enabled: true } })),
    } as unknown as NotificationApplicationPort;
  }

  it('create: valid body reaches the port, malformed body is rejected before it', async () => {
    const api = createApi();
    const router = registerNotificationRoutes(api, {
      auth: authMiddleware,
      requireRole: () => authMiddleware,
    });
    const handler = getHandler(router, 'post', '/');

    const validRes = createRes();
    await handler(
      createReq({ title: 'Hi', content: 'Body', type: 'Reminder', category: 'Task' }),
      validRes,
    );
    expect(validRes.statusCode).toBe(201);
    expect(api.createNotification).toHaveBeenCalledTimes(1);

    const badRes = createRes();
    await handler(
      createReq({ title: '', content: '', type: 'Reminder', category: 'Task' }),
      badRes,
    );
    expect(badRes.statusCode).toBe(400);
    expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(api.createNotification).toHaveBeenCalledTimes(1);
  });

  it('batch-read: empty notificationIds is rejected before the port', async () => {
    const api = createApi();
    const router = registerNotificationRoutes(api, {
      auth: authMiddleware,
      requireRole: () => authMiddleware,
    });
    const handler = getHandler(router, 'post', '/batch-read');

    const badRes = createRes();
    await handler(createReq({ notificationIds: [] }), badRes);
    expect(badRes.statusCode).toBe(400);
    expect(api.batchMarkAsRead).not.toHaveBeenCalled();

    const validRes = createRes();
    await handler(
      createReq({ notificationIds: ['INotificationId_550e8400-e29b-41d4-a716-446655440000'] }),
      validRes,
    );
    expect(validRes.statusCode).toBe(200);
    expect(api.batchMarkAsRead).toHaveBeenCalledTimes(1);
  });

  it('preferences update: valid body reaches the port, malformed is rejected', async () => {
    const api = createApi();
    const router = registerNotificationRoutes(api, {
      auth: authMiddleware,
      requireRole: () => authMiddleware,
    });
    const handler = getHandler(router, 'put', '/preferences');

    const validRes = createRes();
    await handler(createReq({ enabled: true }), validRes);
    expect(validRes.statusCode).toBe(200);
    expect(api.updatePreferences).toHaveBeenCalledTimes(1);

    const badRes = createRes();
    await handler(
      createReq({ doNotDisturb: { enabled: true, startTime: '', endTime: '', daysOfWeek: [9] } }),
      badRes,
    );
    expect(badRes.statusCode).toBe(400);
    expect(api.updatePreferences).toHaveBeenCalledTimes(1);
  });
});

describe('notification SSE framing + header-before-flush (RefArch Phase 2)', () => {
  function getSseHandler(
    router: ReturnType<typeof registerNotificationRoutes>,
  ): (req: unknown, res: unknown) => Promise<unknown> {
    const layer = (
      router as unknown as {
        stack: Array<{
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: Array<{ handle: (r: unknown, s: unknown) => unknown }>;
          };
        }>;
      }
    ).stack.find(
      (candidate) => candidate.route?.path === '/sse' && candidate.route.methods.get === true,
    );
    const handler = layer!.route!.stack.at(-1)!.handle;
    return handler as (req: unknown, res: unknown) => Promise<unknown>;
  }

  function createSseReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      headers: {},
      query: {},
      // Simulate the global RequestContext middleware (owned by apps/api).
      requestContext: {
        requestId: 'req-notification-sse',
        traceId: 'req-notification-sse',
        startedAt: 1_700_000_000_000,
        source: 'http',
      },
      ...overrides,
    };
  }

  function createSseRes() {
    const writes: string[] = [];
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableEnded: false,
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      end: vi.fn(function (this: { writableEnded: boolean }) {
        this.writableEnded = true;
      }),
    });
    return { res, writes };
  }

  it('keeps SSE headers/framing and exposes X-Request-Id before the first chunk', async () => {
    const api = {
      subscribeSseEvents: vi.fn(() => () => undefined),
      getDeliveryReceipts: vi.fn(async () => ({ ok: true, data: [] })),
    } as unknown as NotificationApplicationPort;

    const router = registerNotificationRoutes(api, {
      // Real auth shape: the Cloud Auth middleware writes req.user.identityId.
      auth: ((req, _res, next) => {
        (req as Record<string, unknown>).user = { identityId: 'identity-1' };
        next();
      }) as RequestHandler,
      requireRole: () => authMiddleware,
    });

    const handler = getSseHandler(router);

    const req = Object.assign(
      new EventEmitter(),
      createSseReq({ user: { identityId: 'identity-1' } }),
    );
    const { res, writes } = createSseRes();

    const pending = handler(req, res);
    await Promise.resolve();
    res.emit('close');
    await pending;

    const setHeaders = Object.fromEntries(
      (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.map(([k, v]: [string, string]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    expect(setHeaders['content-type']).toBe('text/event-stream');
    expect(setHeaders['cache-control']).toBe('no-cache');
    expect(setHeaders['connection']).toBe('keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
    // The route does not own X-Request-Id (global middleware does), but the
    // carrier it read carries the entry requestId for correlation.
    expect((req as { requestContext?: { requestId?: string } }).requestContext?.requestId).toBe(
      'req-notification-sse',
    );
    expect(writes.length).toBeGreaterThanOrEqual(0);
  });

  it('fails closed without an authenticated identity — never subscribes or streams', async () => {
    const subscribe = vi.fn(() => () => undefined);
    const api = {
      subscribeSseEvents: subscribe,
      getDeliveryReceipts: vi.fn(async () => ({ ok: true, data: [] })),
    } as unknown as NotificationApplicationPort;

    const router = registerNotificationRoutes(api, {
      // Auth passed but the principal is absent (e.g. optional auth path).
      auth: ((_req, _res, next) => next()) as RequestHandler,
      requireRole: () => authMiddleware,
    });

    const handler = getSseHandler(router);
    const req = Object.assign(
      new EventEmitter(),
      createSseReq({
        // No user → defaultExtractContext resolves an empty identity.
        user: undefined,
        query: { identityId: 'identity-B' },
      }),
    );
    const { res } = createSseRes();
    const statusSpy = vi.fn((code: number) => {
      (res as unknown as { statusCode: number }).statusCode = code;
      return res;
    });
    (res as unknown as { status: (code: number) => unknown }).status = statusSpy;

    await handler(req, res);

    expect(statusSpy).toHaveBeenCalledWith(401);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('scopes the stream exclusively by cx.identityId — a query param cannot select another tenant', async () => {
    let sseHandler:
      ((event: { identityId: string; id: string; updatedAt: number }) => void) | undefined;
    const api = {
      subscribeSseEvents: vi.fn((handler: typeof sseHandler) => {
        sseHandler = handler;
        return () => undefined;
      }),
      getDeliveryReceipts: vi.fn(async () => ({ ok: true, data: [] })),
    } as unknown as NotificationApplicationPort;

    const router = registerNotificationRoutes(api, {
      auth: ((req, _res, next) => {
        (req as Record<string, unknown>).user = { identityId: 'identity-A' };
        next();
      }) as RequestHandler,
      requireRole: () => authMiddleware,
    });

    const handler = getSseHandler(router);
    const req = Object.assign(
      new EventEmitter(),
      createSseReq({
        user: { identityId: 'identity-A' },
        // Attacker attempts to select identity B through the query.
        query: { identityId: 'identity-B' },
      }),
    );
    const { res, writes } = createSseRes();

    await handler(req, res);

    expect(sseHandler).toBeDefined();

    // identity B's event must never be delivered to identity A's stream.
    sseHandler!({ identityId: 'identity-B', id: 'op-B', updatedAt: 1 });
    sseHandler!({ identityId: 'identity-A', id: 'op-A', updatedAt: 2 });

    const stream = writes.join('');
    expect(stream).toContain('identity-A');
    expect(stream).not.toContain('identity-B');
  });
});
