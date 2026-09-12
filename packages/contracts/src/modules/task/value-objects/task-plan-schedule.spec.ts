import { describe, expect, it } from 'vitest';
import {
  TaskPlanScheduleSchema,
  TaskRecurrenceEndKind,
  TaskTimingKind,
} from './task-plan-schedule';

const allDay = { kind: TaskTimingKind.AllDay } as const;

describe('TaskPlanScheduleSchema', () => {
  it('accepts a one-time calendar task without a recurrence side channel', () => {
    expect(
      TaskPlanScheduleSchema.parse({ kind: 'OneTime', date: '2026-09-08', timing: allDay }),
    ).toEqual({ kind: 'OneTime', date: '2026-09-08', timing: allDay });
  });

  it('accepts recurring schedule with an explicit end algebra', () => {
    expect(
      TaskPlanScheduleSchema.parse({
        kind: 'Recurring',
        startDate: '2026-09-08',
        timing: { kind: 'At', time: '09:30' },
        recurrence: {
          frequency: 'Weekly',
          interval: 1,
          byWeekday: [1, 3, 5],
          end: { kind: TaskRecurrenceEndKind.Count, count: 15 },
        },
      }),
    ).toMatchObject({ kind: 'Recurring', startDate: '2026-09-08' });
  });

  it('rejects invalid schedule combinations', () => {
    expect(() =>
      TaskPlanScheduleSchema.parse({
        kind: 'Recurring',
        startDate: '2026-09-08',
        timing: { kind: 'Window', start: '10:00', end: '09:00' },
        recurrence: {
          frequency: 'Weekly',
          interval: 1,
          byWeekday: [],
          end: { kind: 'Never' },
        },
      }),
    ).toThrow();
  });
});
