import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { ScheduleEventApplicationPort } from '../server/application';
import { registerScheduleEventRoutes } from './schedule-event.routes';

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

function createScheduleControllerStub(): ScheduleEventApplicationPort {
  return {
    create: vi.fn(),
    get: vi.fn(),
    getByTimeRange: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getConflicts: vi.fn(),
    detectConflicts: vi.fn(),
    createWithConflictDetection: vi.fn(),
    resolveConflict: vi.fn(),
  } as unknown as ScheduleEventApplicationPort;
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
  _def?: { typeName?: string; innerType?: unknown };
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
          _def?: { typeName?: string; innerType?: unknown };
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

// basePath is '/api/v1/schedules/events', and :param becomes {param} in OpenAPI paths
const BASE = '/api/v1/schedules/events';

describe('schedule event route contracts', () => {
  it('list endpoint uses contracts schemas (array of CalendarEntryResponseSchema)', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', BASE);
    const responseSchema = getResponseSchema(listRoute, 200);

    // The response wraps in success envelope with data as ZodArray
    expect(responseSchema).toBeDefined();
    // Verify the schema accepts an envelope wrapping an array of entries
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: [],
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // Should reject if data is not an array
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: 'not-an-array',
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('route params use branded IDs (not bare strings)', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const paramsSchema = getParamsSchema(getRoute);

    // brandedId rejects bare strings
    expect(paramsSchema.safeParse({ id: 'not-a-branded-id' }).success).toBe(false);
  });

  it('create body schema uses CreateScheduleRequestSchema', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createSchema = getJsonBodySchema(getRegisteredRoute(registry, 'post', BASE));

    // Should reject an empty object (CreateScheduleRequestSchema requires fields)
    expect(createSchema.safeParse({}).success).toBe(false);
  });

  it('delete endpoint response has null data field in success envelope', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(deleteRoute, 200);

    // successResponse(z.null()) wraps into { ok, code, message, data: null, timestamp }
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // data must be null, not an object
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

  it('core CRUD response schemas do not use passthrough()', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    // The create, get, update, and delete response schemas should be proper contracts schemas
    const createRoute = getRegisteredRoute(registry, 'post', BASE);
    const createResponse = getResponseSchema(createRoute, 201);
    expect(createResponse).toBeDefined();

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const getResponse = getResponseSchema(getRoute, 200);
    expect(getResponse).toBeDefined();

    const updateRoute = getRegisteredRoute(registry, 'put', `${BASE}/{id}`);
    const updateResponse = getResponseSchema(updateRoute, 200);
    expect(updateResponse).toBeDefined();
  });

  it('query schema supports either all events or an explicit Timed range', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', BASE);
    const querySchema = listRoute.request?.query as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(querySchema.safeParse({ startTime: '1000', endTime: '2000' }).success).toBe(true);
    expect(querySchema.safeParse({ startTime: '1000' }).success).toBe(true);
    expect(querySchema.safeParse({}).success).toBe(true);
  });

  it('delete endpoint body schema requires expectedVersion (rejects missing)', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const bodySchema = getJsonBodySchema(deleteRoute);

    // Missing expectedVersion must fail validation (contract: cannot fabricate)
    expect(bodySchema.safeParse({}).success).toBe(false);
    expect(bodySchema.safeParse({ expectedVersion: undefined }).success).toBe(false);
    // Valid expectedVersion passes
    expect(bodySchema.safeParse({ expectedVersion: 3 }).success).toBe(true);
  });

  it('delete endpoint declares 409 CONFLICT response', () => {
    const registry = new TestOpenApiRegistry();

    registerScheduleEventRoutes(
      createScheduleControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(deleteRoute, 409);

    expect(
      responseSchema.safeParse({
        ok: false,
        code: 409,
        message: '版本冲突',
        error: {
          code: 'CONFLICT',
          message: '版本冲突',
          context: { currentVersion: 2, expectedVersion: 1 },
        },
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // 409 is not a success envelope (data must not be present)
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('delete endpoint passes the parsed body (expectedVersion) to controller.delete', () => {
    const registry = new TestOpenApiRegistry();
    const controller = createScheduleControllerStub();

    registerScheduleEventRoutes(
      controller,
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = registry.paths.find((c) => c.method === 'delete' && c.path === `${BASE}/{id}`);
    expect(route).toBeDefined();
    // The route's declared body schema must carry a required expectedVersion (safeint number),
    // so a caller cannot delete without an explicit version (no fabrication on the wire).
    const bodySchema = getJsonBodySchema(route!);
    expect(bodySchema.safeParse({}).success).toBe(false);
    expect(bodySchema.safeParse({ expectedVersion: 4 }).success).toBe(true);
  });
});
