import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { TaskPlanController } from '../../server/transport/task-plan.controller';
import { registerTaskPlanRoutes } from './task-plan.routes';

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

function createControllerStub(): TaskPlanController {
  const okResult = { ok: true, data: null };
  return {
    createTemplate: vi.fn(async () => okResult),
    getTemplate: vi.fn(async () => okResult),
    listTemplates: vi.fn(async () => okResult),
    updateTemplate: vi.fn(async () => okResult),
    deleteTemplate: vi.fn(async () => okResult),
    activateTemplate: vi.fn(async () => okResult),
    pauseTemplate: vi.fn(async () => okResult),
    archiveTemplate: vi.fn(async () => okResult),
    generateInstances: vi.fn(async () => okResult),
    getInstancesByTemplate: vi.fn(async () => okResult),
    bindToGoal: vi.fn(async () => okResult),
    unbindFromGoal: vi.fn(async () => okResult),
  } as unknown as TaskPlanController;
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

function getQuerySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.query as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

const BASE = '/api/v1/task-plans';

function registerAll(registry: TestOpenApiRegistry) {
  return registerTaskPlanRoutes(
    createControllerStub(),
    { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
    registry,
  );
}

describe('task-plan route contracts', () => {
  it('POST / creates a template with proper body and response schemas', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', BASE);
    const bodySchema = getJsonBodySchema(route);
    const responseSchema = getResponseSchema(route, 201);

    expect(bodySchema).toBeDefined();
    expect(responseSchema).toBeDefined();
    // Valid payload should pass
    expect(
      bodySchema.safeParse({
        name: 'My Task',
        importance: 'Important',
        schedule: { kind: 'OneTime', date: '2026-09-08', timing: { kind: 'AllDay' } },
      }).success,
    ).toBe(true);
    // Empty object should fail (name required)
    expect(bodySchema.safeParse({}).success).toBe(false);
  });

  it('GET / list uses TaskPlanListResponseSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', BASE);
    const responseSchema = getResponseSchema(route, 200);
    expect(responseSchema).toBeDefined();
  });

  it('GET /list query uses ListTaskPlanFiltersSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', BASE);
    const querySchema = getQuerySchema(route);
    expect(querySchema).toBeDefined();
    // Query with status array should pass
    expect(querySchema.safeParse({ status: ['active'] }).success).toBe(true);
  });

  it('GET /{id} detail uses TaskPlanResponseSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(route, 200);
    const paramsSchema = getParamsSchema(route);

    expect(responseSchema).toBeDefined();
    expect(paramsSchema).toBeDefined();
    // brandedId rejects bare strings
    expect(paramsSchema.safeParse({ id: 'not-a-branded-id' }).success).toBe(false);
  });

  it('PUT /{id} update body uses UpdateTaskPlanSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'put', `${BASE}/{id}`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
  });

  it('DELETE /{id} returns z.null() data', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(route, 200);

    expect(responseSchema).toBeDefined();
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
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

  it('POST /{id}/activate returns TaskPlanResponseSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/activate`);
    const responseSchema = getResponseSchema(route, 200);
    expect(responseSchema).toBeDefined();
  });

  it('POST /{id}/generate-instances returns z.array(TaskOccurrenceResponseSchema)', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/generate-instances`);
    const responseSchema = getResponseSchema(route, 200);
    expect(responseSchema).toBeDefined();
    // Array should pass
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: [],
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
  });

  it('GET /{id}/instances query uses TaskPlanInstancesQuerySchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', `${BASE}/{id}/instances`);
    const querySchema = getQuerySchema(route);
    expect(querySchema).toBeDefined();
    expect(querySchema.safeParse({ from: Date.now(), to: Date.now() + 60_000 }).success).toBe(true);
    expect(
      querySchema.safeParse({
        from: '2026-05-06T00:00:00.000Z',
        to: '2026-05-07T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('POST /{id}/bind-goal body uses TaskGoalBindingSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/bind-goal`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
  });

  it('core CRUD response schemas are defined (not passthrough)', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    // Create
    expect(getResponseSchema(getRegisteredRoute(registry, 'post', BASE), 201)).toBeDefined();
    // List
    expect(getResponseSchema(getRegisteredRoute(registry, 'get', BASE), 200)).toBeDefined();
    // Detail
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'get', `${BASE}/{id}`), 200),
    ).toBeDefined();
    // Update
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'put', `${BASE}/{id}`), 200),
    ).toBeDefined();
    // Delete
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'delete', `${BASE}/{id}`), 200),
    ).toBeDefined();
    // Activate
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'post', `${BASE}/{id}/activate`), 200),
    ).toBeDefined();
    // Pause
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'post', `${BASE}/{id}/pause`), 200),
    ).toBeDefined();
    // Archive
    expect(
      getResponseSchema(getRegisteredRoute(registry, 'post', `${BASE}/{id}/archive`), 200),
    ).toBeDefined();
  });

  it('all param schemas use branded IDs', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const idRoutes = [
      `${BASE}/{id}`,
      `${BASE}/{id}/activate`,
      `${BASE}/{id}/pause`,
      `${BASE}/{id}/archive`,
      `${BASE}/{id}/generate-instances`,
      `${BASE}/{id}/instances`,
      `${BASE}/{id}/bind-goal`,
      `${BASE}/{id}/unbind-goal`,
    ];

    for (const path of idRoutes) {
      const method =
        path.includes('activate') ||
        path.includes('pause') ||
        path.includes('archive') ||
        path.includes('bind') ||
        path.includes('unbind') ||
        path.includes('generate')
          ? 'post'
          : 'get';
      const route = getRegisteredRoute(registry, method, path);
      const paramsSchema = getParamsSchema(route);
      expect(paramsSchema).toBeDefined();
      expect(paramsSchema.safeParse({ id: 'bare-string' }).success).toBe(false);
    }
  });
});

describe('task template mutation routes run the real validation adapter (Phase 4)', () => {
  function getHandler(
    router: ReturnType<typeof registerTaskPlanRoutes>,
    method: string,
    path: string,
  ): (req: unknown, res: unknown) => Promise<unknown> {
    const stack = (
      router as unknown as {
        stack: Array<{
          route?: {
            path: string;
            methods: Record<string, boolean>;
            stack: Array<{ handle: (r: unknown, s: unknown) => unknown }>;
          };
        }>;
      }
    ).stack;
    const layer = stack.find(
      (candidate) => candidate.route?.path === path && candidate.route.methods[method] === true,
    );
    expect(layer, `${method} ${path} registered`).toBeDefined();
    return layer!.route!.stack.at(-1)!.handle;
  }

  function createReq(body: unknown): Record<string, unknown> {
    return {
      body,
      params: { id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440000' },
      headers: {},
      query: {},
      user: { identityId: 'identity-1' },
      requestContext: {
        requestId: 'req-task-adapter',
        traceId: 'req-task-adapter',
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

  it('create: malformed name is rejected before the controller', async () => {
    const controller = createControllerStub();
    const router = registerTaskPlanRoutes(controller, { auth: authMiddleware }, null);
    const handler = getHandler(router, 'post', '/');

    const badRes = createRes();
    await handler(createReq({ name: '' }), badRes);
    expect(badRes.statusCode).toBe(400);
    expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(controller.createTemplate).not.toHaveBeenCalled();

    const validRes = createRes();
    await handler(
      createReq({
        name: 'My Task',
        schedule: { kind: 'OneTime', date: '2026-09-08', timing: { kind: 'AllDay' } },
        importance: 'Moderate',
      }),
      validRes,
    );
    expect(validRes.statusCode).toBe(201);
    expect(controller.createTemplate).toHaveBeenCalledTimes(1);
  });

  it('update: params + body are validated together before the controller', async () => {
    const controller = createControllerStub();
    const router = registerTaskPlanRoutes(controller, { auth: authMiddleware }, null);
    const handler = getHandler(router, 'put', '/:id');

    const badRes = createRes();
    await handler(createReq({ name: '' }), badRes);
    expect(badRes.statusCode).toBe(400);
    expect(controller.updateTemplate).not.toHaveBeenCalled();

    const validRes = createRes();
    await handler(createReq({ name: 'Updated Name' }), validRes);
    expect(validRes.statusCode).toBe(200);
    expect(controller.updateTemplate).toHaveBeenCalledTimes(1);
  });
});
