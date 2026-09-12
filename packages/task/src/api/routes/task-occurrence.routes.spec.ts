import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { TaskOccurrenceController } from '../../server/transport/task-occurrence.controller';
import { registerTaskOccurrenceRoutes } from './task-occurrence.routes';

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

function createControllerStub(): TaskOccurrenceController {
  return {
    getInstance: vi.fn(),
    listInstances: vi.fn(),
    getInstancesByDateRange: vi.fn(),
    completeInstance: vi.fn(),
    uncompleteInstance: vi.fn(),
    skipInstance: vi.fn(),
    startInstance: vi.fn(),
    deleteInstance: vi.fn(),
    markMissedInstance: vi.fn(),
    rescheduleInstance: vi.fn(),
  } as unknown as TaskOccurrenceController;
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

const BASE = '/api/v1/task-occurrences';

function registerAll(registry: TestOpenApiRegistry) {
  return registerTaskOccurrenceRoutes(
    createControllerStub(),
    { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
    registry,
  );
}

describe('task-occurrence route contracts', () => {
  it('GET /by-date-range uses GetTaskOccurrencesByRangeSchema query', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', `${BASE}/by-date-range`);
    const querySchema = getQuerySchema(route);
    const responseSchema = getResponseSchema(route, 200);

    expect(querySchema).toBeDefined();
    expect(responseSchema).toBeDefined();
    expect(
      querySchema.safeParse({ startDate: Date.now(), endDate: Date.now() + 60_000 }).success,
    ).toBe(true);
    expect(
      querySchema.safeParse({
        startDate: '2026-05-06T00:00:00.000Z',
        endDate: '2026-05-07T00:00:00.000Z',
      }).success,
    ).toBe(false);
    // Array response should pass
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

  it('POST /:id/missed uses an explicit fact command and there is no check-expired route', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/missed`);
    const bodySchema = getJsonBodySchema(route);
    const responseSchema = getResponseSchema(route, 200);
    expect(bodySchema.safeParse({ reason: 'No completion evidence' }).success).toBe(true);
    expect(bodySchema.safeParse({ reason: 42 }).success).toBe(false);
    expect(responseSchema).toBeDefined();
    expect(registry.paths.some((candidate) => candidate.path === `${BASE}/check-expired`)).toBe(
      false,
    );
  });

  it('GET / list uses z.array(TaskOccurrenceResponseSchema)', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', BASE);
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
    // Non-array should fail
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

  it('GET /{id} detail uses TaskOccurrenceResponseSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'get', `${BASE}/{id}`);
    const responseSchema = getResponseSchema(route, 200);
    const paramsSchema = getParamsSchema(route);

    expect(responseSchema).toBeDefined();
    expect(paramsSchema).toBeDefined();
    expect(paramsSchema.safeParse({ id: 'bare-string' }).success).toBe(false);
  });

  it('POST /{id}/complete body uses CompleteTaskOccurrenceSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/complete`);
    const bodySchema = getJsonBodySchema(route);
    const responseSchema = getResponseSchema(route, 200);

    expect(bodySchema).toBeDefined();
    expect(responseSchema).toBeDefined();
    expect(bodySchema.safeParse(undefined).success).toBe(true);
    expect(bodySchema.safeParse({ note: 'Finished from the dashboard', rating: 5 }).success).toBe(
      true,
    );
  });

  it('POST /{id}/uncomplete restores a completed task instance', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/uncomplete`);
    const responseSchema = getResponseSchema(route, 200);

    expect(responseSchema).toBeDefined();
    expect(getParamsSchema(route).safeParse({ id: 'bare-string' }).success).toBe(false);
  });

  it('POST /{id}/skip body uses SkipTaskOccurrenceSchema', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/skip`);
    const bodySchema = getJsonBodySchema(route);
    const responseSchema = getResponseSchema(route, 200);

    expect(bodySchema).toBeDefined();
    expect(responseSchema).toBeDefined();
    expect(bodySchema.safeParse(undefined).success).toBe(true);
    expect(bodySchema.safeParse({ reason: 'Deferred until tomorrow' }).success).toBe(true);
  });

  it('POST /{id}/reschedule requires owner time + expectedVersion', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const route = getRegisteredRoute(registry, 'post', `${BASE}/{id}/reschedule`);
    const bodySchema = getJsonBodySchema(route);
    expect(
      bodySchema.safeParse({
        newTime: {
          timeType: 'TimePoint',
          startDate: Date.now(),
          timePoint: 16 * 60,
          timeRange: null,
        },
        expectedVersion: 3,
      }).success,
    ).toBe(true);
    expect(
      bodySchema.safeParse({
        newTime: { timeType: 'TimePoint', startDate: null, timePoint: 16 * 60, timeRange: null },
        expectedVersion: 3,
      }).success,
    ).toBe(false);
    expect(
      bodySchema.safeParse({
        newTime: {
          timeType: 'TimePoint',
          startDate: Date.now(),
          timePoint: 16 * 60,
          timeRange: null,
        },
      }).success,
    ).toBe(false);
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

  it('all param schemas use branded IDs', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const idRoutes = [
      [`${BASE}/{id}`, 'get'],
      [`${BASE}/{id}/complete`, 'post'],
      [`${BASE}/{id}/uncomplete`, 'post'],
      [`${BASE}/{id}/skip`, 'post'],
      [`${BASE}/{id}/start`, 'post'],
      [`${BASE}/{id}/reschedule`, 'post'],
      [`${BASE}/{id}`, 'delete'],
    ] as const;

    for (const [path, method] of idRoutes) {
      const route = getRegisteredRoute(registry, method, path);
      const paramsSchema = getParamsSchema(route);
      expect(paramsSchema).toBeDefined();
      expect(paramsSchema.safeParse({ id: 'bare-string' }).success).toBe(false);
    }
  });
});
