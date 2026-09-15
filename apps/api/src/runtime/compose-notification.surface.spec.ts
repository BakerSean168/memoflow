import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Notification API runtime composer surface.
 * 通知 API runtime composer 表面契约。
 *
 * Locks the Step C wiring: apps/api/src/server.ts must compose notification
 * through the runtime composer, must no longer reference the retired
 * `createNotificationApiModule` transport factory or the
 * `@memoflow/notification/api` seam, and must take the schedule notification
 * port from the composer instead of building a second Prisma repository set.
 * The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step C 接线：apps/api/src/server.ts 必须通过 runtime composer 组装通知，
 * 不再引用已退役的 `createNotificationApiModule` transport 工厂或
 * `@memoflow/notification/api` seam，并从 composer 获取 schedule notification
 * port（而不是构造第二套 Prisma 仓储集合）。composer 只允许接触计划允许的窄 seam。
 */
describe('notification API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-notification.ts'), 'utf8');

  it('server.ts composes notification via composeNotification({ db: prisma, closureChecker, channelCapabilities })', () => {
    expect(server).toContain("from './runtime/compose-notification'");
    expect(server).toMatch(
      /composeNotification\(\{\s*db: prisma,\s*closureChecker: accountActiveChecker,\s*userTimeContextPort: settingApiModule\.userTimeContextPort,\s*channelCapabilities:/,
    );
    expect(server).toContain('.register(notificationApiModule.module)');
  });

  it('server.ts no longer references createNotificationApiModule or the notification/api seam', () => {
    expect(server).not.toMatch(/\bcreateNotificationApiModule\b/);
    expect(server).not.toContain("from '@memoflow/notification/api'");
  });

  it('NOTIF-3302 removes the scheduler-facing NotificationPort from host composition', () => {
    expect(server).not.toContain('createNotificationPrismaScheduleNotificationPort');
    expect(server).not.toContain("from '@memoflow/notification/schedule-execution'");
    expect(server).not.toContain('notificationApiModule.scheduleNotificationPort');
    expect(composer).not.toContain('scheduleNotificationPort:');
    expect(composer).not.toContain('createNotificationScheduleNotificationPort');
  });

  it('composer only touches the narrow seams (no deep server import)', () => {
    expect(composer).toContain('interface ComposeNotificationDependencies');
    expect(composer).toContain("from '@memoflow/notification'");
    expect(composer).toContain("from '@memoflow/notification/api'");
    expect(composer).not.toMatch(/@memoflow\/notification\/server/);
  });

  it('composer exposes the durable NotificationRequested writer from the SAME repository set', () => {
    expect(composer).toContain('requestedWriter: NotificationRequestedWriterPort');
    expect(composer).toContain('requestedWriter: repositories.requestedWriter');
    expect(composer).toContain('NotificationRequestedWriterPort');
    expect(composer).toContain('type NotificationRequestedWriterPort,');
  });
});
