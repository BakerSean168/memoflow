import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { GoalController } from '../../server/transport/goal.controller';
import { registerGoalRoutes } from './index';
import { registerGoalCrudRoutes } from './goal.routes';

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

function createGoalControllerStub(): GoalController {
  const okResult = { ok: true, data: null };
  return {
    create: vi.fn(async () => okResult),
    list: vi.fn(async () => okResult),
    search: vi.fn(async () => okResult),
    get: vi.fn(async () => okResult),
    update: vi.fn(async () => okResult),
    delete: vi.fn(async () => okResult),
    archive: vi.fn(async () => okResult),
    activate: vi.fn(async () => okResult),
    complete: vi.fn(async () => okResult),
    getAggregate: vi.fn(async () => okResult),
    cloneGoal: vi.fn(async () => okResult),
    batchUpdateKeyResultWeights: vi.fn(async () => okResult),
  } as unknown as GoalController;
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

function getQuerySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.query as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function getParamsSchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.params as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function getResponseSchema(
  route: RegisteredRoute,
  status: number,
): {
  safeParse: (value: unknown) => { success: boolean };
} {
  const responses = route.responses as
    Record<string, { content?: Record<string, unknown> }> | undefined;
  const response = responses?.[String(status)];
  const schema = (response?.content as Record<string, unknown> | undefined)?.[
    'application/json'
  ] as { schema?: { safeParse: (value: unknown) => { success: boolean } } } | undefined;
  return schema?.schema as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function createGoalUseCasesStub(): Parameters<typeof registerGoalRoutes>[0] {
  return {
    createGoal: vi.fn(),
    getGoal: vi.fn(),
    listGoals: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    archiveExpiredGoals: vi.fn(),
    archiveGoal: vi.fn(),
    activateGoal: vi.fn(),
    completeGoal: vi.fn(),
    searchGoals: vi.fn(),
    addKeyResult: vi.fn(),
    updateKeyResult: vi.fn(),
    updateKeyResultProgress: vi.fn(),
    deleteKeyResult: vi.fn(),
    addReview: vi.fn(),
    listReviews: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(),
    createRecord: vi.fn(),
    listRecords: vi.fn(),
    deleteRecord: vi.fn(),
    activateFocusMode: vi.fn(),
    deactivateFocusMode: vi.fn(),
    extendFocusMode: vi.fn(),
    getCurrentFocusMode: vi.fn(),
    getGoalAggregate: vi.fn(),
    cloneGoal: vi.fn(),
    batchUpdateKeyResultWeights: vi.fn(),
  };
}

describe('goal mutation routes run the real validation adapter (Phase 4)', () => {
  function getHandler(
    router: ReturnType<typeof registerGoalCrudRoutes>,
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
      params: { id: 'IGoalId_550e8400-e29b-41d4-a716-446655440000' },
      headers: {},
      query: {},
      user: { identityId: 'identity-1' },
      requestContext: {
        requestId: 'req-goal-adapter',
        traceId: 'req-goal-adapter',
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

  it('create: valid body reaches the controller, malformed body is rejected before it', async () => {
    const controller = createGoalControllerStub();
    const router = registerGoalCrudRoutes(
      controller,
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      null,
    );
    const handler = getHandler(router, 'post', '/');

    const validRes = createRes();
    await handler(createReq({ name: 'Ship architecture fixes' }), validRes);
    expect(validRes.statusCode).toBe(201);
    expect(controller.create).toHaveBeenCalledTimes(1);

    const badRes = createRes();
    await handler(createReq({ name: '' }), badRes);
    expect(badRes.statusCode).toBe(400);
    expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(controller.create).toHaveBeenCalledTimes(1);
  });

  it('archive: missing expectedVersion is rejected before the controller', async () => {
    const controller = createGoalControllerStub();
    const router = registerGoalCrudRoutes(
      controller,
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      null,
    );
    const handler = getHandler(router, 'post', '/:id/archive');

    const badRes = createRes();
    await handler(createReq({}), badRes);
    expect(badRes.statusCode).toBe(400);
    expect(badRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(controller.archive).not.toHaveBeenCalled();

    const validRes = createRes();
    await handler(createReq({ expectedVersion: 1 }), validRes);
    expect(validRes.statusCode).toBe(200);
    expect(controller.archive).toHaveBeenCalledTimes(1);
  });
});

describe('goal route contracts', () => {
  it('registers canonical create, versioned update, and clone body schemas', () => {
    const registry = new TestOpenApiRegistry();

    registerGoalCrudRoutes(
      createGoalControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createSchema = getJsonBodySchema(getRegisteredRoute(registry, 'post', '/api/v1/goals'));
    const updateSchema = getJsonBodySchema(
      getRegisteredRoute(registry, 'put', '/api/v1/goals/{id}'),
    );
    const cloneSchema = getJsonBodySchema(
      getRegisteredRoute(registry, 'post', '/api/v1/goals/{id}/clone'),
    );

    expect(createSchema.safeParse({ name: 'Ship architecture fixes' }).success).toBe(true);
    expect(createSchema.safeParse({ title: 'Legacy title' }).success).toBe(false);

    expect(
      updateSchema.safeParse({ name: 'Ship architecture fixes v2', expectedVersion: 1 }).success,
    ).toBe(true);
    expect(updateSchema.safeParse({ name: 'Missing version' }).success).toBe(false);
    expect(updateSchema.safeParse({ title: 'Legacy title' }).success).toBe(false);
    expect(cloneSchema.safeParse({ name: 'Ship architecture fixes (copy)' }).success).toBe(true);
    expect(cloneSchema.safeParse({ title: 'Legacy clone title' }).success).toBe(false);
  });

  it('registers search query schema with query as the only formal search field', () => {
    const registry = new TestOpenApiRegistry();

    registerGoalCrudRoutes(
      createGoalControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const searchSchema = getQuerySchema(
      getRegisteredRoute(registry, 'get', '/api/v1/goals/search'),
    );

    expect(searchSchema.safeParse({ query: 'contracts' }).success).toBe(true);
    expect(searchSchema.safeParse({ q: 'contracts' }).success).toBe(false);
  });

  it('coerces the delete expectedVersion from an HTTP query string', () => {
    const registry = new TestOpenApiRegistry();

    registerGoalCrudRoutes(
      createGoalControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteSchema = getQuerySchema(
      getRegisteredRoute(registry, 'delete', '/api/v1/goals/{id}'),
    );

    expect(deleteSchema.safeParse({ expectedVersion: '1' }).success).toBe(true);
    expect(deleteSchema.safeParse({ expectedVersion: 'invalid' }).success).toBe(false);
  });

  it('documents key-result routes with named list and detail contracts', () => {
    const registry = new TestOpenApiRegistry();

    registerGoalRoutes(
      createGoalUseCasesStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', '/api/v1/goals/{id}/key-results');
    const detailMutationRoute = getRegisteredRoute(
      registry,
      'put',
      '/api/v1/goals/{id}/key-results/{krId}',
    );

    expect(getResponseSchema(listRoute, 200)).toBeDefined();
    expect(getResponseSchema(detailMutationRoute, 200)).toBeDefined();
    expect(
      getParamsSchema(detailMutationRoute).safeParse({ id: 'bare', krId: 'bare' }).success,
    ).toBe(false);
  });

  it('documents review delete with a Goal mutation receipt', () => {
    const registry = new TestOpenApiRegistry();

    registerGoalRoutes(
      createGoalUseCasesStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'delete', '/api/v1/goals/{id}/reviews/{reviewId}');
    const responseSchema = getResponseSchema(route, 200);

    const receiptResult = responseSchema.safeParse({
      ok: true,
      code: 200,
      message: 'ok',
      data: {
        goalId: 'IGoalId_00000000-0000-4000-8000-000000000001',
        goalVersion: 2,
        affectedEntityIds: {
          goalIds: ['IGoalId_00000000-0000-4000-8000-000000000001'],
          keyResultIds: [],
          recordIds: [],
          reviewIds: ['IGoalReviewId_00000000-0000-4000-8000-000000000002'],
        },
        readModel: {
          id: 'IGoalId_00000000-0000-4000-8000-000000000001',
          identityId: 'IdentityId_00000000-0000-4000-8000-000000000003',
          name: 'Goal',
          description: null,
          feasibilityAnalysis: null,
          motivation: null,
          status: 'Active',
          startDate: null,
          dueDate: null,
          completedAt: null,
          archivedAt: null,
          sortOrder: 0,
          reminderConfig: null,
          labels: [],
          createdAt: 1,
          updatedAt: 2,
          deletedAt: null,
          version: 2,
          keyResults: [],
          reviews: [],
          totalKeyResults: 0,
          completedKeyResults: 0,
          overallProgress: 0,
        },
      },
      timestamp: Date.now(),
    });
    expect(
      receiptResult.success,
      'error' in receiptResult ? JSON.stringify(receiptResult.error) : undefined,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { success: true },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });
});
