import { afterEach, describe, expect, it } from 'vitest';
import {
  RecurrenceFrequency,
  TaskRecurrenceEndKind,
  type TaskRecurrence,
} from '@memoflow/contracts/task';
import type { RecurrenceEnginePort, RecurrenceSchedule } from '@memoflow/time';
import { asYmd, createTimeContext, createTimeFacade } from '@memoflow/time';
import { createTaskRecurrenceDateAdapter } from './task-recurrence-date.adapter';

const originalTimeZone = process.env.TZ;

const UTC_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TOKYO_CONTEXT = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const NEW_YORK_CONTEXT = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 });


afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function recurrence(
  frequency: (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency],
  overrides: Partial<{
    interval: number;
    byWeekday: number[];
    end: TaskRecurrence['end'];
  }> = {},
): TaskRecurrence {
  return {
    frequency,
    interval: overrides.interval ?? 1,
    byWeekday: overrides.byWeekday ?? [],
    end: overrides.end ?? { kind: TaskRecurrenceEndKind.Never },
  };
}

describe('Task recurrence adapter (TASK-2204)', () => {
  it('maps Task config to the MemoFlow recurrence port without leaking rrule types', () => {
    process.env.TZ = 'Asia/Tokyo';
    const schedules: RecurrenceSchedule[] = [];
    const engine: RecurrenceEnginePort = {
      between(schedule) {
        schedules.push(schedule);
        return [];
      },
      next() {
        return null;
      },
    };
    const adapter = createTaskRecurrenceDateAdapter(engine);
    adapter.between(
      recurrence(RecurrenceFrequency.Weekly, {
        interval: 2,
        byWeekday: [1, 5],
        end: { kind: TaskRecurrenceEndKind.Until, date: asYmd('2026-02-28') },
      }),
      asYmd('2026-01-05'),
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 2, 1),
      TOKYO_CONTEXT,
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      startDate: '2026-01-05',
      localTime: '00:00',
      timeZone: 'Asia/Tokyo',
      frequency: 'weekly',
      interval: 2,
      byWeekday: [1, 5],
      count: null,
    });
    expect(schedules[0].until).toBe(
      createTimeFacade({ context: TOKYO_CONTEXT }).calendar.endOfDay(
        Date.parse('2026-02-28T00:00:00.000Z'),
      ),
    );
  });

  it.each([
    [RecurrenceFrequency.Daily, 'daily'],
    [RecurrenceFrequency.Weekly, 'weekly'],
    [RecurrenceFrequency.Monthly, 'monthly'],
    [RecurrenceFrequency.Yearly, 'yearly'],
  ] as const)('maps %s to engine frequency %s', (taskFrequency, engineFrequency) => {
    process.env.TZ = 'UTC';
    let captured: RecurrenceSchedule | null = null;
    const engine: RecurrenceEnginePort = {
      between(schedule) {
        captured = schedule;
        return [];
      },
      next() {
        return null;
      },
    };
    const adapter = createTaskRecurrenceDateAdapter(engine);
    const daysOfWeek = taskFrequency === RecurrenceFrequency.Weekly ? [1] : [];
    adapter.between(
      recurrence(taskFrequency, {
        byWeekday: daysOfWeek,
        end: { kind: TaskRecurrenceEndKind.Count, count: 7 },
      }),
      asYmd('2026-01-01'),
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 11, 31),
      UTC_CONTEXT,
    );
    expect(captured?.frequency).toBe(engineFrequency);
    expect(captured?.count).toBe(7);
  });

  it('uses the explicit canonical start date instead of legacy time configuration', () => {
    process.env.TZ = 'UTC';
    const adapter = createTaskRecurrenceDateAdapter();
    const dates = adapter.between(
      recurrence(RecurrenceFrequency.Daily, {
        end: { kind: TaskRecurrenceEndKind.Count, count: 3 },
      }),
      asYmd('2026-01-10'),
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 31),
      UTC_CONTEXT,
    );
    expect(dates.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-01-10T00:00:00.000Z',
      '2026-01-11T00:00:00.000Z',
      '2026-01-12T00:00:00.000Z',
    ]);
  });

  it('enforces COUNT in the selected recurrence engine', () => {
    process.env.TZ = 'UTC';
    const adapter = createTaskRecurrenceDateAdapter();
    const dates = adapter.between(
      recurrence(RecurrenceFrequency.Daily, {
        end: { kind: TaskRecurrenceEndKind.Count, count: 3 },
      }),
      asYmd('2026-01-01'),
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 31, 23, 59, 59, 999),
      UTC_CONTEXT,
    );
    expect(dates.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
    ]);
  });

  it('treats Task endDate as an inclusive local-day boundary', () => {
    process.env.TZ = 'Asia/Tokyo';
    const adapter = createTaskRecurrenceDateAdapter();
    const time = createTimeFacade({ context: TOKYO_CONTEXT });
    const dates = adapter.between(
      recurrence(RecurrenceFrequency.Daily, {
        end: { kind: TaskRecurrenceEndKind.Until, date: asYmd('2026-01-03') },
      }),
      asYmd('2026-01-01'),
      time.codec.startOfYmd(asYmd('2026-01-01')),
      time.calendar.endOfDay(time.codec.startOfYmd(asYmd('2026-01-05'))),
      TOKYO_CONTEXT,
    );
    expect(dates.map((instant) => new Date(instant).getDate())).toEqual([1, 2, 3]);
  });

  it('keeps local calendar dates stable across New York fall DST', () => {
    process.env.TZ = 'America/New_York';
    const adapter = createTaskRecurrenceDateAdapter();
    const dates = adapter.between(
      recurrence(RecurrenceFrequency.Daily, {
        end: { kind: TaskRecurrenceEndKind.Count, count: 3 },
      }),
      asYmd('2026-10-31'),
      Date.UTC(2026, 9, 31),
      Date.UTC(2026, 10, 2, 23, 59, 59, 999),
      NEW_YORK_CONTEXT,
    );

    expect(dates.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-10-31T04:00:00.000Z',
      '2026-11-01T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
  });

  it('keeps local calendar dates stable across New York spring DST', () => {
    process.env.TZ = 'America/New_York';
    const adapter = createTaskRecurrenceDateAdapter();
    const dates = adapter.between(
      recurrence(RecurrenceFrequency.Daily, {
        end: { kind: TaskRecurrenceEndKind.Count, count: 4 },
      }),
      asYmd('2026-03-07'),
      Date.UTC(2026, 2, 7),
      Date.UTC(2026, 2, 10, 23, 59, 59, 999),
      NEW_YORK_CONTEXT,
    );

    expect(dates.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-03-07T05:00:00.000Z',
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
      '2026-03-10T04:00:00.000Z',
    ]);
  });
  it('is host-timezone independent for the same explicit TimeContext', () => {
    const adapter = createTaskRecurrenceDateAdapter();
    const startDate = asYmd('2026-09-09');
    const taskRecurrence = recurrence(RecurrenceFrequency.Daily, {
      end: { kind: TaskRecurrenceEndKind.Count, count: 2 },
    });
    const from = Date.UTC(2026, 8, 8, 0, 0, 0);
    const to = Date.UTC(2026, 8, 10, 23, 59, 59, 999);

    process.env.TZ = 'UTC';
    const fromUtcHost = adapter.between(taskRecurrence, startDate, from, to, TOKYO_CONTEXT);
    process.env.TZ = 'America/Los_Angeles';
    const fromLosAngelesHost = adapter.between(
      taskRecurrence,
      startDate,
      from,
      to,
      TOKYO_CONTEXT,
    );

    expect(fromLosAngelesHost).toEqual(fromUtcHost);
    expect(fromUtcHost.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-09-08T15:00:00.000Z',
      '2026-09-09T15:00:00.000Z',
    ]);
  });

});
