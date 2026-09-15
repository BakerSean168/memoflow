import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task API runtime composer surface.
 * 任务 API runtime composer 表面契约。
 *
 * Locks the Step 3 wiring: apps/api/src/server.ts must compose task through the
 * runtime composer and must no longer reference the retired
 * `createTaskApiModule` transport factory or the `@memoflow/task/api` seam.
 * The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step 3 接线：apps/api/src/server.ts 必须通过 runtime composer 组装任务，
 * 且不再引用已退役的 `createTaskApiModule` transport 工厂或 `@memoflow/task/api`
 * seam。composer 只允许接触计划允许的窄 seam。
 */
describe('task API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-task.ts'), 'utf8');

  it('server.ts composes task via composeTask({ db: prisma, runtimeContributions, goalProgressHandler })', () => {
    expect(server).toContain("from './runtime/compose-task'");
    expect(server).toMatch(/composeTask\(\{\s*db: prisma,/);
    expect(server).toContain('.register(taskComposed.module)');
    expect(server).toContain('goalProgressHandler: createGoalTaskProgressPrismaHandler(prisma)');
  });

  it('server.ts no longer references createTaskApiModule or the task/api seam', () => {
    expect(server).not.toMatch(/\bcreateTaskApiModule\b/);
    expect(server).not.toContain("from '@memoflow/task/api'");
  });

  it('composer only touches the narrow seams (no routePrefix, no deep server import)', () => {
    expect(composer).toContain('interface ComposeTaskDependencies');
    expect(composer).toContain("from '@memoflow/task'");
    expect(composer).toContain("from '@memoflow/task/api'");
    expect(composer).not.toContain('routePrefix');
    expect(composer).not.toMatch(/@memoflow\/task\/server/);
    expect(composer).not.toMatch(/@memoflow\/goal\/server/);
  });

  it('composer exposes the task repositories needed for scheduled-handler registration', () => {
    expect(composer).toContain('taskOccurrenceRepository: ITaskOccurrenceRepository');
    expect(composer).toContain('taskPlanRepository: ITaskPlanRepository');
    expect(composer).toContain('taskOccurrenceRepository,');
    expect(composer).toContain('taskPlanRepository,');
  });

  it('server.ts registers the task.reminder.fire handler on the schedule handlerRegistry after composeTask', () => {
    expect(server).toContain('createTaskReminderScheduledHandlerRegistration');
    expect(server).toContain('scheduleOrchestrationModule.handlerRegistry.register(');
    expect(server).toMatch(
      /taskOccurrenceRepository: taskComposed\.taskOccurrenceRepository/,
    );
    expect(server).toMatch(
      /taskPlanRepository: taskComposed\.taskPlanRepository/,
    );
    expect(server).toMatch(
      /notificationRequestedWriter: notificationApiModule\.repositories\.requestedWriter/,
    );
  });
});
