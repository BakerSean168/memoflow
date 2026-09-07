import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GOAL-3202 Desktop host wiring surface.
 * GOAL-3202 Desktop 宿主接线表面契约。
 *
 * Locks the `goal.reminder.fire` registration in the desktop lane: main.ts must
 * register the PowerSync-backed fire handler on the schedule orchestration
 * handler registry with the SAME notification PowerSync repository set (via the
 * composer's `requestedWriter`), keeping the Scheduler domain-neutral.
 *
 * 锁定 `goal.reminder.fire` 在 desktop lane 的注册：main.ts 必须把基于 PowerSync
 * 的 trigger handler 注册到 schedule 编排的 handler registry，并复用同一通知
 * PowerSync 仓储集合（经 composer 的 `requestedWriter`），使 Scheduler 保持领域中立。
 */
describe('goal.reminder.fire desktop host wiring surface', () => {
  const mainDir = resolve(__dirname, '..');
  const main = readFileSync(resolve(mainDir, 'main.ts'), 'utf8');
  const composer = readFileSync(resolve(__dirname, 'compose-notification.ts'), 'utf8');

  it('main.ts registers createGoalPowerSyncReminderFireHandler on the orchestration handlerRegistry', () => {
    expect(main).toContain(
      "import { createGoalPowerSyncReminderFireHandler } from '@memoflow/goal/schedule-execution';",
    );
    expect(main).toContain(
      'scheduleOrchestrationModule.handlerRegistry.register(\n    createGoalPowerSyncReminderFireHandler(db, notificationComposed.requestedWriter),',
    );
  });

  it('composeNotification surfaces the shared requestedWriter from the repository set', () => {
    expect(composer).toContain('type NotificationRequestedWriterPort,');
    expect(composer).toContain('readonly requestedWriter: NotificationRequestedWriterPort;');
    expect(composer).toContain('requestedWriter: repositories.requestedWriter,');
  });
});
