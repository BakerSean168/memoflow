import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task desktop runtime composer surface.
 * 任务 desktop runtime composer 表面契约。
 *
 * Locks the Step 4 wiring: apps/desktop/src/main/main.ts must compose task
 * through the runtime composer and must no longer reference the retired
 * `createTaskElectronModule` transport factory or the `@memoflow/task/electron`
 * seam. The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step 4 接线：apps/desktop/src/main/main.ts 必须通过 runtime composer 组装任务，
 * 且不再引用已退役的 `createTaskElectronModule` transport 工厂或
 * `@memoflow/task/electron` seam。composer 只允许接触计划允许的窄 seam。
 */
describe('task desktop runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const main = readFileSync(resolve(dir, 'main.ts'), 'utf8');
  const composer = readFileSync(resolve(__dirname, 'compose-task.ts'), 'utf8');

  it('main.ts composes task via composeTask({ db, runtimeContributions, goalProgressHandler })', () => {
    expect(main).toContain("from './runtime/compose-task'");
    expect(main).toMatch(/composeTask\(\{\s*db,/);
    expect(main).toContain('goalProgressHandler: createGoalTaskProgressPowerSyncHandler(db)');
    expect(main).toContain('const taskElectronModule = taskComposed.module');
  });

  it('main.ts no longer references createTaskElectronModule or the task/electron seam', () => {
    expect(main).not.toMatch(/\bcreateTaskElectronModule\b/);
    expect(main).not.toContain("from '@memoflow/task/electron'");
  });

  it('composer selects PowerSync adapters, builds the conditional outbox runtime, and returns the module plus repository view', () => {
    expect(composer).toContain('interface ComposeTaskDependencies');
    expect(composer).toContain('createTaskPowerSyncRepositories');
    expect(composer).toContain('createTaskPowerSyncGoalOutboxRuntime');
    expect(composer).toContain('repositories');
    expect(composer).toContain("from '@memoflow/task/electron'");
    expect(composer).not.toMatch(/@memoflow\/task\/server/);
    expect(composer).not.toMatch(/@memoflow\/task\/infrastructure/);
    expect(composer).not.toMatch(/@memoflow\/goal\/server/);
  });

  it('main.ts registers the task.reminder.fire handler on the schedule handlerRegistry after composeTask', () => {
    expect(main).toContain('createTaskReminderScheduledHandlerRegistration');
    expect(main).toContain('scheduleOrchestrationModule.handlerRegistry.register(');
    expect(main).toMatch(
      /taskOccurrenceRepository: taskComposed\.repositories\.taskOccurrenceRepository/,
    );
    expect(main).toMatch(
      /taskPlanRepository: taskComposed\.repositories\.taskPlanRepository/,
    );
    expect(main).toMatch(
      /notificationRequestedWriter: notificationComposed\.repositories\.requestedWriter/,
    );
  });
});
