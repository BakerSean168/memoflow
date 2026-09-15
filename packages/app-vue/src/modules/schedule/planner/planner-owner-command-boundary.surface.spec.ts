import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const router = readFileSync(resolve(__dirname, 'planner-owner-command.router.ts'), 'utf8');

describe('Planner owner command boundary (PLAN-4303)', () => {
  it('depends only on owner client commands and has no Scheduler invocation persistence access', () => {
    expect(router).toContain("Pick<ScheduleClientPort, 'updateSchedule'>");
    expect(router).toContain("Pick<TaskClientPort, 'rescheduleOccurrence'>");
    expect(router).toContain("Pick<GoalClientPort, 'updateGoal'>");
    expect(router).not.toMatch(/from ['"]@memoflow\/schedule-orchestration/);
    expect(router).not.toContain('ScheduleTaskClientDTO');
    expect(router).not.toContain('SchedulingPort');
    expect(router).not.toContain('ScheduledInvocationContext');
    expect(router).not.toContain('updateTaskMetadata');
    expect(router).not.toContain('createTask(');
  });
});
