import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { ReminderController } from '../../server/transport/reminder.controller';
import { registerReminderGroupRoutes } from './reminder-group.routes';

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

function createReminderControllerStub(): ReminderController {
  return {
    createTemplate: vi.fn(),
    listTemplates: vi.fn(),
    getUpcomingReminders: vi.fn(),
    getTodaySchedule: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    enableTemplate: vi.fn(),
    pauseTemplate: vi.fn(),
    toggleTemplate: vi.fn(),
    moveTemplate: vi.fn(),
    getTemplateHistory: vi.fn(),
    recordResponse: vi.fn(),
    getTemplateResponses: vi.fn(),
    getResponseStats: vi.fn(),
    analyzeFrequency: vi.fn(),
    adjustFrequency: vi.fn(),
    rejectFrequencyAdjustment: vi.fn(),
    createGroup: vi.fn(),
    listGroups: vi.fn(),
    getGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    batchGroupTemplates: vi.fn(),
    toggleGroup: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  } as unknown as ReminderController;
}

function getRegisteredRoute(
  registry: TestOpenApiRegistry,
  method: string,
  path: string,
): RegisteredRoute {
  const route = registry.paths.find((candidate) => candidate.method === method && candidate.path === path);

  expect(route).toBeDefined();
  return route!;
}

function getJsonBodySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return (((route.request?.body as Record<string, unknown> | undefined)?.content as
    | Record<string, unknown>
    | undefined)?.['application/json'] as Record<string, unknown> | undefined)?.schema as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function getResponseSchema(
  route: RegisteredRoute,
  status: number,
): {
  safeParse: (value: unknown) => { success: boolean };
} {
  const responses = route.responses as Record<string, { content?: Record<string, unknown> }> | undefined;
  const response = responses?.[String(status)];
  const schema = (response?.content as Record<string, unknown> | undefined)?.[
    'application/json'
  ] as { schema?: { safeParse: (value: unknown) => { success: boolean } } } | undefined;
  return schema?.schema ?? (response as unknown as { safeParse: (value: unknown) => { success: boolean } });
}

function getParamsSchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.params as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

// basePath is '/api/v1/reminders', and :param becomes {param} in OpenAPI paths
const BASE = '/api/v1/reminders';

describe('reminder group route contracts', () => {
  it('list endpoint uses ReminderGroupListResponseSchema from contracts', () => {
    const registry = new TestOpenApiRegistry();

    registerReminderGroupRoutes(
      createReminderControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', `${BASE}/groups`);
    const responseSchema = getResponseSchema(listRoute, 200);

    expect(responseSchema).toBeDefined();
    // Response is wrapped in success envelope with data shaped by ReminderGroupListResponseSchema
    // Inner shape: { groups: [], total, page, pageSize, hasMore }
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { groups: [], total: 0, page: 1, pageSize: 20, hasMore: false },
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // Should reject if data uses wrong field names
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { data: [], total: 0 },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('create body schema accepts valid group data', () => {
    const registry = new TestOpenApiRegistry();

    registerReminderGroupRoutes(
      createReminderControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createSchema = getJsonBodySchema(getRegisteredRoute(registry, 'post', `${BASE}/groups`));

    // Should accept a valid create payload
    expect(
      createSchema.safeParse({
        name: 'Medicine reminders',
        description: 'Daily medication reminders',
      }).success,
    ).toBe(true);

    // Should reject an empty object
    expect(createSchema.safeParse({}).success).toBe(false);
  });

  it('group route params use branded IDs (not bare strings)', () => {
    const registry = new TestOpenApiRegistry();

    registerReminderGroupRoutes(
      createReminderControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/groups/{id}`);
    const paramsSchema = getParamsSchema(getRoute);

    // brandedId rejects bare strings
    expect(paramsSchema.safeParse({ id: 'not-a-branded-id' }).success).toBe(false);
  });

  it('update body schema uses UpdateReminderGroupSchema', () => {
    const registry = new TestOpenApiRegistry();

    registerReminderGroupRoutes(
      createReminderControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const updateSchema = getJsonBodySchema(getRegisteredRoute(registry, 'put', `${BASE}/groups/{id}`));

    // Update schema should accept partial updates with valid fields
    expect(updateSchema.safeParse({ name: 'Updated group name' }).success).toBe(true);
  });

  it('does not expose the retired control-mode route', () => {
    const registry = new TestOpenApiRegistry();

    registerReminderGroupRoutes(
      createReminderControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    expect(
      registry.paths.some((route) => route.path === `${BASE}/groups/{id}/control-mode`),
    ).toBe(false);
  });

});
