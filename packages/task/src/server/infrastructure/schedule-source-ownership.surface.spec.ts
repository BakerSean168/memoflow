import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TASK-3101 ownership boundary:
 * Task projection is an identity-scoped neutral ScheduledIntent source.
 * Legacy ScheduleTask execution adapters are forbidden; scheduled execution is handler-key based.
 */
describe('task schedule source ownership surface', () => {
  const projection = readFileSync(resolve(__dirname, './schedule-projection-source.ts'), 'utf8');

  it('projection is identity-scoped and emits neutral SchedulingPort inputs', () => {
    expect(projection).toContain(
      'buildPlanProjection(planId: string, identityId: string): Promise<TaskScheduleProjectionPlan>;',
    );
    expect(projection).toContain(
      'buildPlanOwner(planId: string, identityId: string): SchedulingOwner;',
    );
    expect(projection).toContain('ScheduledIntent<TaskReminderScheduledPayload>');
    expect(projection).toContain('SchedulingOwner');
    expect(projection).toContain("TASK_REMINDER_HANDLER_KEY = 'task.reminder.fire'");
    expect(projection).toMatch(/findByIdForIdentity\(\s*identityId,\s*planId,?\s*\)/);
    expect(projection).not.toContain('findById(planId)');
    expect(projection).toContain('findByPlanId(');
    expect(projection).toContain('String(planDTO.identityId)');
    expect(projection).not.toContain('ScheduleTask');
    expect(projection).not.toContain('IScheduleTaskRepository');
    expect(projection).not.toContain('SourceModule');
  });

  it('does not resurrect the legacy ScheduleTask execution source', () => {
    expect(() => readFileSync(resolve(__dirname, './schedule-execution-source.ts'), 'utf8')).toThrow();
    expect(projection).not.toContain('@memoflow/scheduler');
  });
});
