import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { ScheduleApplicationPort } from '../server/application';
import { registerScheduleRoutes } from './routes';

type RegisteredRoute = { method: string; path: string };
class TestOpenApiRegistry implements OpenApiRegistryLike {
  readonly paths: RegisteredRoute[] = [];
  registerPath(route: Record<string, unknown>): void { this.paths.push(route as RegisteredRoute); }
  register(): void {}
}
const auth = ((_, __, next) => next()) as RequestHandler;
const api: ScheduleApplicationPort = {
  queryRebuildTimeline: vi.fn(),
  replayRebuildOutbox: vi.fn(),
  getOperationAudit: vi.fn(),
};

describe('Planner/Calendar operational route ownership', () => {
  it('owns rebuild reliability routes and no raw ScheduleTask diagnostics', () => {
    const registry = new TestOpenApiRegistry();
    registerScheduleRoutes(api, { auth, requireRole: vi.fn(() => auth) }, registry);
    expect(registry.paths.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort()).toEqual([
      'GET /api/v1/schedules/operations/rebuild/audit',
      'GET /api/v1/schedules/operations/rebuild/timeline',
      'POST /api/v1/schedules/operations/rebuild/{id}/replay',
    ]);
    expect(registry.paths.some((r) => r.path.includes('/tasks'))).toBe(false);
  });
});
