import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('S4-2302B Scheduler persistence retirement', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../prisma/schema/schedule.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    resolve(__dirname, '../../prisma/migrations/retire-legacy-schedule-task-runtime.sql'),
    'utf8',
  );

  it('keeps ScheduledInvocation and InvocationAttempt as the sole Temporal Engine persistence truth', () => {
    expect(schema).toMatch(/model ScheduledInvocation\s*\{/);
    expect(schema).toMatch(/model InvocationAttempt\s*\{/);
    expect(schema).not.toMatch(/model ScheduleTask\s*\{/);
    expect(schema).not.toMatch(/model ScheduleExecution\s*\{/);
    expect(schema).not.toMatch(/model ScheduleStatistic\s*\{/);
  });

  it('ships an explicit destructive cutover for the retired worker tables', () => {
    for (const table of ['schedule_tasks', 'schedule_executions', 'schedule_statistics']) {
      expect(migration).toContain(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }
  });
});
