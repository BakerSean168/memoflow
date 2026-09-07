import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { SchedulerApplicationPort } from '../server/application';
import { registerSchedulerRoutes } from './routes';

type Route = { method: string; path: string };
class Registry implements OpenApiRegistryLike {
  paths: Route[] = [];
  registerPath(route: Record<string, unknown>): void { this.paths.push(route as Route); }
  register(): void {}
}
const auth = ((_, __, next) => next()) as RequestHandler;
const api: SchedulerApplicationPort = {
  listTasks: vi.fn(),
  getTask: vi.fn(),
  getDueTasks: vi.fn(),
};

describe('Temporal Engine diagnostics route ownership', () => {
  it('exposes raw worker diagnostics read-only', () => {
    const registry = new Registry();
    registerSchedulerRoutes(api, { auth, requireRole: vi.fn(() => auth) }, registry);
    expect(registry.paths.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort()).toEqual([
      'GET /api/v1/schedules/tasks',
      'GET /api/v1/schedules/tasks/due',
      'GET /api/v1/schedules/tasks/{id}',
    ]);
    expect(registry.paths.every((r) => r.method.toLowerCase() === 'get')).toBe(true);
  });
});
