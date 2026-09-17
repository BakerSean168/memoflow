import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('schedule API runtime physical boundary', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-schedule.ts'), 'utf8');

  it('creates one Calendar set and one canonical Scheduler set for orchestration/runtime', () => {
    expect(server.match(/createSchedulePrismaRepositories\(prisma/g) ?? []).toHaveLength(1);
    expect(server.match(/createSchedulerPrismaRepositories\(prisma/g) ?? []).toHaveLength(1);
    expect(server).toContain(
      'invocationRepository: schedulerRepositorySet.scheduledInvocationRepository',
    );
    expect(server).toContain('calendarRepositories: calendarRepositorySet');
    expect(server).toContain('schedulerRepositories: schedulerRepositorySet');
    expect(server).not.toContain('scheduleTaskRepository');
    expect(server).not.toContain('scheduleExecutionRepository');
  });

  it('registers Calendar and Temporal Engine as sibling transport modules', () => {
    expect(server).toContain('.register(scheduleApiModule.calendarModule)');
    expect(server).toContain('.register(scheduleApiModule.schedulerModule)');
  });

  it('does not restore the retired ScheduleTask outbox/repository seam', () => {
    expect(server).toContain('createSchedulerPrismaRepositories(prisma)');
    expect(server).not.toMatch(/createSchedulerPrismaRepositories\(prisma,\s*\{/);
    expect(server).not.toContain('new PrismaOutboxWriter(prisma)');
    expect(composer).toContain('createScheduledInvocationRuntimeContribution');
    expect(composer).toContain('scheduledInvocationRepository');
    expect(composer).toContain('invocationAttemptRepository');
  });

  it('composer depends on public Schedule and Scheduler seams only', () => {
    expect(composer).toContain("from '@memoflow/schedule'");
    expect(composer).toContain("from '@memoflow/scheduler'");
    expect(composer).toContain("from '@memoflow/schedule/api'");
    expect(composer).toContain("from '@memoflow/scheduler/api'");
    expect(composer).not.toMatch(/@memoflow\/(?:schedule|scheduler)\/server/);
  });
});
