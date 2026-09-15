import { describe, expect, it } from 'vitest';
import { taskPlanScheduleFromDraft } from './task-plan-schedule.mapper';

describe('taskPlanScheduleFromDraft Product Time projection (TIME-1205)', () => {
  it('projects the draft instant to the explicit schedule timezone instead of the server timezone', () => {
    const schedule = taskPlanScheduleFromDraft({
      cadence: 'once',
      startDate: Date.parse('2026-03-08T04:30:00.000Z'),
      timezone: 'America/New_York',
      daysOfWeek: [],
      occurrences: null,
    });

    expect(schedule).toMatchObject({ kind: 'OneTime', date: '2026-03-07' });
  });

  it('keeps the same instant on the next local day in Tokyo', () => {
    const schedule = taskPlanScheduleFromDraft({
      cadence: 'once',
      startDate: Date.parse('2026-03-08T16:30:00.000Z'),
      timezone: 'Asia/Tokyo',
      daysOfWeek: [],
      occurrences: null,
    });

    expect(schedule).toMatchObject({ kind: 'OneTime', date: '2026-03-09' });
  });
});
