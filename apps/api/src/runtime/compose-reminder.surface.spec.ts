import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reminder API runtime composer surface.
 * 提醒 API runtime composer 表面契约。
 *
 * Locks the Step C wiring: apps/api/src/server.ts must compose reminder through
 * the runtime composer, must no longer reference the retired
 * `createReminderApiModule` transport factory or the `@memoflow/reminder/api`
 * seam, and must take the reminder schedule sources from the composer instead of
 * building a second Prisma repository set. The composer must only touch the
 * narrow seams the plan allows.
 *
 * 锁定 Step C 接线：apps/api/src/server.ts 必须通过 runtime composer 组装提醒，
 * 不再引用已退役的 `createReminderApiModule` transport 工厂或
 * `@memoflow/reminder/api` seam，并从 composer 获取提醒 schedule sources
 * （而不是构造第二套 Prisma 仓储集合）。composer 只允许接触计划允许的窄 seam。
 */
describe('reminder API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-reminder.ts'), 'utf8');

  it('server.ts composes reminder with the NotificationRequested writer owned by Reminder', () => {
    expect(server).toContain("from './runtime/compose-reminder'");
    expect(server).toMatch(
      /composeReminder\(\{\s*db: prisma,\s*notificationRequestedWriter: notificationApiModule\.requestedWriter,\s*userTimeContextPort: settingApiModule\.userTimeContextPort,\s*closureChecker: accountActiveChecker,\s*executorClosureChecker,?\s*\}/,
    );
    expect(server).toContain('.register(reminderComposed.module)');
  });

  it('server.ts no longer references createReminderApiModule or the reminder/api seam', () => {
    expect(server).not.toMatch(/\bcreateReminderApiModule\b/);
    expect(server).not.toContain("from '@memoflow/reminder/api'");
  });

  it('server.ts takes the reminder schedule sources from the composer (no second Prisma set)', () => {
    expect(server).not.toMatch(/createReminderPrismaSchedule(Execution|Projection)Source/);
    // First-class Routine uses the same package subpaths legitimately; only the
    // legacy Reminder Prisma source factories are forbidden here.
    expect(server).toContain('reminderComposed.scheduleExecutionSource');
    expect(server).toContain('reminderComposed.scheduleProjectionSource');
  });

  it('NOTIF-3302 keeps NotificationPort out of schedule orchestration', () => {
    expect(server).not.toMatch(/notificationPort:\s*notificationApiModule/);
    expect(server).toContain('notificationRequestedWriter: notificationApiModule.requestedWriter');
  });

  it('ROUTINE-3402 keeps legacy Reminder cron out of production composition', () => {
    expect(composer).not.toMatch(/createReminderTriggerCron(Runtime|Job)/);
    expect(server).not.toMatch(/createReminderTriggerCron(Runtime|Job)/);
    expect(composer).toContain('runtimeContributions: normalizeRuntimeContributions');
  });

  it('composer only touches the narrow seams (no deep server import)', () => {
    expect(composer).toContain('interface ComposeReminderDependencies');
    expect(composer).toContain("from '@memoflow/reminder'");
    expect(composer).toContain("from '@memoflow/reminder/api'");
    expect(composer).not.toMatch(/@memoflow\/reminder\/server/);
  });
});
