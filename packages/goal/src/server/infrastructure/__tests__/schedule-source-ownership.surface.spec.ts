import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GOAL-3201 ownership boundary:
 * Goal projection is an identity-scoped neutral ScheduledIntent source.
 * Legacy ScheduleTask execution adapters are forbidden; scheduled execution is handler-key based.
 */
describe('schedule source ownership surface', () => {
  const goalProjection = readFileSync(
    resolve(__dirname, '../schedule-projection-source.ts'),
    'utf8',
  );
  it('goal projection is identity-scoped and emits neutral SchedulingPort inputs (GOAL-3201)', () => {
    expect(goalProjection).toContain(
      'buildGoalPlan(goalId: string, identityId: string): Promise<GoalScheduleProjectionPlan>;',
    );
    expect(goalProjection).toContain(
      'buildGoalOwner(goalId: string, identityId: string): SchedulingOwner;',
    );
    expect(goalProjection).toContain('ScheduledIntent<GoalReminderScheduledPayload>');
    expect(goalProjection).toContain('SchedulingOwner');
    expect(goalProjection).toContain("GOAL_REMINDER_HANDLER_KEY = 'goal.reminder.fire'");
    expect(goalProjection).toContain('findByIdForIdentity(identityId, goalId, {');
    expect(goalProjection).not.toContain('findById(goalId, { includeChildren: true })');
    expect(goalProjection).toContain('findAllGoalRefs(');
    expect(goalProjection).toContain('String(goalDTO.identityId)');
    expect(goalProjection).not.toContain('ScheduleTask');
    expect(goalProjection).not.toContain('IScheduleTaskRepository');
    expect(goalProjection).not.toContain('SourceModule');
  });

  it('does not resurrect the legacy Goal ScheduleTask execution source', () => {
    expect(() =>
      readFileSync(resolve(__dirname, '../schedule-execution-source.ts'), 'utf8'),
    ).toThrow();
    expect(goalProjection).not.toContain('@memoflow/scheduler');
  });
});
