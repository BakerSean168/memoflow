import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** S4-2302B: legacy ScheduleTask/ScheduleExecution contract bodies must stay retired. */
describe('Schedule/Scheduler contract convergence', () => {
  const schedule = resolve(__dirname, '..');
  const schedulerRoutes = resolve(
    __dirname,
    '../../../../../scheduler/src/api/routes.ts',
  );

  it('physically removes legacy ScheduleTask/ScheduleExecution contract bodies', () => {
    for (const relative of [
      'aggregates/schedule-task-client.ts',
      'aggregates/schedule-task-server.ts',
      'entities/schedule-execution-client.ts',
      'entities/schedule-execution-server.ts',
      'api/requests/schedule-task-requests.ts',
      'api/requests/schedule-execution-requests.ts',
      'value-objects/source-module.ts',
      'value-objects/schedule-config.ts',
      'value-objects/task-priority.ts',
      'value-objects/schedule-task-status.ts',
    ]) {
      expect(existsSync(resolve(schedule, relative)), relative).toBe(false);
    }
  });

  it('keeps Schedule product contracts on CalendarEntry/Planner plus the neutral scheduling seam', () => {
    const moduleIndex = readFileSync(resolve(schedule, 'index.ts'), 'utf8');
    const schemas = readFileSync(resolve(schedule, 'api/response-schemas.ts'), 'utf8');
    const scheduling = readFileSync(resolve(schedule, 'scheduling.ts'), 'utf8');

    expect(moduleIndex).toContain("export * from './calendar-entry-range'");
    expect(moduleIndex).toContain("export * from './planner'");
    expect(moduleIndex).toContain("export * from './scheduling'");
    expect(schemas).toContain('export const CalendarEntryResponseSchema');
    expect(schemas).not.toContain('ScheduleTaskResponseSchema');
    expect(schemas).not.toContain('ScheduleExecutionResponseSchema');
    expect(scheduling).toContain('export interface ScheduledInvocationDiagnostic');
    expect(scheduling).toContain('export const ScheduledInvocationDiagnosticSchema');
  });

  it('uses invocation language for read-only Scheduler HTTP diagnostics', () => {
    const routes = readFileSync(schedulerRoutes, 'utf8');
    expect(routes).toContain("basePath: '/api/v1/scheduler'");
    expect(routes).toContain("path: '/invocations'");
    expect(routes).toContain("path: '/invocations/due'");
    expect(routes).toContain("path: '/invocations/:id'");
    expect(routes).not.toContain("path: '/tasks'");
    expect(routes).not.toMatch(/method: '(?:post|put|patch|delete)'/);
  });
});
