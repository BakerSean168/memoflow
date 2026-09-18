import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AI-9609 owner contract surface', () => {
  const repositoryRoot = resolve(__dirname, '../../../../../../');
  const files = [
    'packages/ai/src/server/application/ports/routine-command.port.ts',
    'packages/ai/src/server/application/ports/planner-read.port.ts',
    'packages/ai/src/server/application/ports/notification-read.port.ts',
    'packages/ai/src/server/mastra/tools/product-tools.ts',
    'apps/api/src/modules/ai/routine-command.adapter.ts',
    'apps/api/src/modules/ai/planner-read.adapter.ts',
    'apps/api/src/modules/ai/notification-read.adapter.ts',
    'apps/desktop/src/main/modules/ai/routine-command.adapter.ts',
    'apps/desktop/src/main/modules/ai/planner-read.adapter.ts',
    'apps/desktop/src/main/modules/ai/notification-read.adapter.ts',
  ];

  it('keeps the AI production surface on canonical Routine trigger variants', () => {
    const source = files
      .filter((file) => file.includes('routine-') || file.endsWith('product-tools.ts'))
      .map((file) => readFileSync(resolve(repositoryRoot, file), 'utf8'))
      .join('\n');

    expect(source).toContain('WallClock');
    expect(source).toContain('Elapsed');
    expect(source).toContain('ActiveUsage');
    expect(source).not.toMatch(/\bFixedTime\b|\bInterval\b|AIRoutineMethodId|method-library/);
  });

  it('locks Planner reads away from worker repositories and shadow DTO fields', () => {
    const source = files
      .filter((file) => file.includes('planner-read'))
      .map((file) => readFileSync(resolve(repositoryRoot, file), 'utf8'))
      .join('\n');

    expect(source).toContain('ScheduleEventApplicationPort');
    expect(source).toContain('derivePlannerConflicts');
    expect(source).not.toMatch(
      /@memoflow\/scheduler|IScheduleRepository|findByTimeRange|hasConflict|conflictingEntryIds|dueAt/,
    );
  });

  it('locks Notification reads/actions to Fact/Inbox owner seams', () => {
    const source = files
      .filter((file) => file.includes('notification-read'))
      .map((file) => readFileSync(resolve(repositoryRoot, file), 'utf8'))
      .join('\n');

    expect(source).toContain('NotificationInboxPort');
    expect(source).toContain('executeAction');
    expect(source).not.toMatch(
      /INotificationRepository|notificationRepository|NotificationCategory|NotificationChannel|deliveryStatus|templateKey/,
    );
  });
});
