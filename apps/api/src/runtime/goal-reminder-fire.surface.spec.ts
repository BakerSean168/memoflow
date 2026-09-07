import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GOAL-3202 API host wiring surface.
 * GOAL-3202 API 宿主接线表面契约。
 *
 * Locks the `goal.reminder.fire` registration in the API lane: server.ts must
 * register the Prisma-backed fire handler on the schedule orchestration handler
 * registry with the SAME notification Prisma repository set (via the composer's
 * `requestedWriter`), keeping the Scheduler domain-neutral.
 *
 * 锁定 `goal.reminder.fire` 在 API lane 的注册：server.ts 必须把基于 Prisma 的
 * trigger handler 注册到 schedule 编排的 handler registry，并复用同一通知 Prisma
 * 仓储集合（经 composer 的 `requestedWriter`），使 Scheduler 保持领域中立。
 */
describe('goal.reminder.fire API host wiring surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-notification.ts'), 'utf8');

  it('server.ts registers createGoalPrismaReminderFireHandler on the orchestration handlerRegistry', () => {
    expect(server).toContain(
      "import { createGoalPrismaReminderFireHandler } from '@memoflow/goal/schedule-execution';",
    );
    expect(server).toContain(
      'scheduleOrchestrationModule.handlerRegistry.register(\n    createGoalPrismaReminderFireHandler(prisma, notificationApiModule.requestedWriter),',
    );
  });

  it('composeNotification surfaces the shared requestedWriter from the repository set', () => {
    expect(composer).toContain('type NotificationRequestedWriterPort,');
    expect(composer).toContain('readonly requestedWriter: NotificationRequestedWriterPort;');
    expect(composer).toContain('requestedWriter: repositories.requestedWriter,');
  });
});
