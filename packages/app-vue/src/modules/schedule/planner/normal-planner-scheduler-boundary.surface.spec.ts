import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const plannerView = readFileSync(resolve(__dirname, '../views/ScheduleCalendarView.vue'), 'utf8');
const calendarView = readFileSync(resolve(__dirname, '../composables/useCalendarView.ts'), 'utf8');

describe('normal Planner owner boundary (PLAN-4302 / RAR-2602/2603)', () => {
  it('does not mount or expose raw Scheduler operations rows from the normal Planner route', () => {
    expect(plannerView).not.toContain('DevScheduleDebugPanel');
    expect(plannerView).not.toContain('scheduleTasks');
    expect(calendarView).not.toContain('scheduleTasks:');
    expect(calendarView).not.toContain('ScheduleTaskClientDTO');
    expect(calendarView).toContain('projections');
  });

  it('feeds Routine markers from the canonical owner client instead of a hard-coded empty lane', () => {
    expect(calendarView).toContain("useStrictInject(ROUTINE_SERVICE_KEY, 'RoutineService')");
    expect(calendarView).toContain('routineService.getUpcomingOccurrences');
    expect(calendarView).not.toContain('plannerRoutineOccurrences.value = [];');
    expect(calendarView).not.toContain('Phase 5 will');
  });

  it('wires editable Goal projections to the Goal owner command', () => {
    expect(plannerView).toContain("useStrictInject(GOAL_SERVICE_KEY, 'GoalService')");
    expect(plannerView).toContain('goal: { updateGoal: goal.updateGoal.bind(goal) }');
  });
});
