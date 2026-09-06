import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { ScheduleApplicationPort } from '../server/application';
import { registerScheduleRoutes } from './routes';

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

function createHandlersStub(): ScheduleApplicationPort {
  return {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    getDueTasks: vi.fn(),
    queryRebuildTimeline: vi.fn(),
    replayRebuildOutbox: vi.fn(),
    getOperationAudit: vi.fn(),
  } as unknown as ScheduleApplicationPort;
}

function registerAll(registry: TestOpenApiRegistry) {
  return registerScheduleRoutes(
    createHandlersStub(),
    { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
    registry,
  );
}

const BASE = '/api/v1/schedules';

describe('schedule raw worker route ownership', () => {
  it('exposes ScheduleTask diagnostics as read-only GET routes', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    const taskRoutes = registry.paths
      .filter((route) => route.path.startsWith(`${BASE}/tasks`))
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    expect(taskRoutes).toEqual(
      [`GET ${BASE}/tasks`, `GET ${BASE}/tasks/due`, `GET ${BASE}/tasks/{id}`].sort(),
    );
  });

  it('does not publish raw ScheduleTask mutation routes', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    expect(
      registry.paths.filter(
        (route) => route.path.startsWith(`${BASE}/tasks`) && route.method.toLowerCase() !== 'get',
      ),
    ).toEqual([]);
  });

  it('keeps audited rebuild replay separate from raw worker CRUD', () => {
    const registry = new TestOpenApiRegistry();
    registerAll(registry);

    expect(
      registry.paths.some(
        (route) =>
          route.method === 'post' && route.path === `${BASE}/operations/rebuild/{id}/replay`,
      ),
    ).toBe(true);
  });
});
