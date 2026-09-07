import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('schedule API runtime physical boundary', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-schedule.ts'), 'utf8');

  it('creates one Calendar set and one Scheduler set and shares only Scheduler task ownership with orchestration', () => {
    expect(server.match(/createSchedulePrismaRepositories\(prisma/g) ?? []).toHaveLength(1);
    expect(server.match(/createSchedulerPrismaRepositories\(prisma/g) ?? []).toHaveLength(1);
    expect(server).toContain('scheduleTaskRepository: schedulerRepositorySet.scheduleTaskRepository');
    expect(server).toContain('calendarRepositories: calendarRepositorySet');
    expect(server).toContain('schedulerRepositories: schedulerRepositorySet');
  });

  it('registers Calendar and Temporal Engine as sibling transport modules', () => {
    expect(server).toContain('.register(scheduleApiModule.calendarModule)');
    expect(server).toContain('.register(scheduleApiModule.schedulerModule)');
  });

  it('keeps the durable outbox writer on Scheduler task persistence', () => {
    expect(server).toMatch(/createSchedulerPrismaRepositories\(prisma,\s*\{\s*outboxWriter: new PrismaOutboxWriter\(prisma\)/);
  });

  it('composer depends on public Schedule and Scheduler seams only', () => {
    expect(composer).toContain("from '@memoflow/schedule'");
    expect(composer).toContain("from '@memoflow/scheduler'");
    expect(composer).toContain("from '@memoflow/schedule/api'");
    expect(composer).toContain("from '@memoflow/scheduler/api'");
    expect(composer).not.toMatch(/@memoflow\/(?:schedule|scheduler)\/server/);
  });
});
