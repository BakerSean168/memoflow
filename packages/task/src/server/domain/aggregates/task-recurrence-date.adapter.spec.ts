import { afterEach, describe, expect, it } from 'vitest';
import { RecurrenceFrequency } from '@memoflow/contracts/task';
import type { RecurrenceEnginePort, RecurrenceSchedule } from '@memoflow/time';
import { createTimeContext, createTimeFacade } from '@memoflow/time';
import { RecurrenceRule, TaskTimeConfig } from '../value-objects';
import { createTaskRecurrenceDateAdapter } from './task-recurrence-date.adapter';

const originalTimeZone = process.env.TZ;

const UTC_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TOKYO_CONTEXT = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const NEW_YORK_CONTEXT = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 });


afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function rule(
  frequency: (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency],
  overrides: Partial<{
    interval: number;
    daysOfWeek: number[];
    endDate: number | null;
    occurrences: number | null;
  }> = {},
): RecurrenceRule {
  return RecurrenceRule.create({
    frequency,
    interval: overrides.interval ?? 1,
    daysOfWeek: overrides.daysOfWeek ?? [],
    endDate: overrides.endDate ?? null,
    occurrences: overrides.occurrences ?? null,
  });
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
    const start = new Date(2026, 0, 5, 12, 0, 0).getTime();
    const endDate = new Date(2026, 1, 28, 12, 0, 0).getTime();
    const config = TaskTimeConfig.createAllDay(start);

    adapter.between(
      rule(RecurrenceFrequency.Weekly, {
        interval: 2,
        daysOfWeek: [1, 5],
        occurrences: null,
        endDate,
      }),
      config,
      new Date(2026, 0, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
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
      createTimeFacade({ context: TOKYO_CONTEXT }).calendar.endOfDay(endDate),
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
    const start = Date.UTC(2026, 0, 1);
    const daysOfWeek = taskFrequency === RecurrenceFrequency.Weekly ? [1] : [];
    adapter.between(
      rule(taskFrequency, { daysOfWeek, occurrences: 7 }),
      TaskTimeConfig.createAllDay(start),
      start,
      Date.UTC(2026, 11, 31),
      UTC_CONTEXT,
    );
    expect(captured?.frequency).toBe(engineFrequency);
    expect(captured?.count).toBe(7);
  });

  it('rejects an unanchored recurring schedule instead of inventing a 1970 COUNT origin', () => {
    process.env.TZ = 'UTC';
    const adapter = createTaskRecurrenceDateAdapter();
    const unanchored = TaskTimeConfig.create({
      timeType: 'AllDay',
      startDate: null,
      timePoint: null,
      timeRange: null,
    });
    expect(() =>
      adapter.between(
        rule(RecurrenceFrequency.Daily, { occurrences: 3 }),
        unanchored,
        Date.UTC(2026, 0, 1),
        Date.UTC(2026, 0, 31),
        UTC_CONTEXT,
      ),
    ).toThrow('Recurring Task requires an anchored local date');
  });

  it('enforces COUNT in the selected recurrence engine', () => {
    process.env.TZ = 'UTC';
    const adapter = createTaskRecurrenceDateAdapter();
    const start = Date.UTC(2026, 0, 1);
    const dates = adapter.between(
      rule(RecurrenceFrequency.Daily, { occurrences: 3 }),
      TaskTimeConfig.createAllDay(start),
      start,
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
    const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const endDate = new Date(2026, 0, 3, 12, 0, 0).getTime();
    const dates = adapter.between(
      rule(RecurrenceFrequency.Daily, { endDate }),
      TaskTimeConfig.createAllDay(start),
      start,
      new Date(2026, 0, 5, 23, 59, 59, 999).getTime(),
      TOKYO_CONTEXT,
    );
    expect(dates.map((instant) => new Date(instant).getDate())).toEqual([1, 2, 3]);
  });

  it('keeps local calendar dates stable across New York fall DST', () => {
    process.env.TZ = 'America/New_York';
    const adapter = createTaskRecurrenceDateAdapter();
    const start = new Date(2026, 9, 31, 12, 0, 0).getTime();
    const dates = adapter.between(
      rule(RecurrenceFrequency.Daily, { occurrences: 3 }),
      TaskTimeConfig.createAllDay(start),
      new Date(2026, 9, 31, 0, 0, 0).getTime(),
      new Date(2026, 10, 2, 23, 59, 59, 999).getTime(),
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
    const start = new Date(2026, 2, 7, 12, 0, 0).getTime();
    const dates = adapter.between(
      rule(RecurrenceFrequency.Daily, { occurrences: 4 }),
      TaskTimeConfig.createAllDay(start),
      new Date(2026, 2, 7, 0, 0, 0).getTime(),
      new Date(2026, 2, 10, 23, 59, 59, 999).getTime(),
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
    const start = Date.UTC(2026, 8, 8, 15, 0, 0); // 2026-09-09 00:00 in Tokyo
    const config = TaskTimeConfig.createAllDay(start);
    const recurrence = rule(RecurrenceFrequency.Daily, { occurrences: 2 });
    const from = Date.UTC(2026, 8, 8, 0, 0, 0);
    const to = Date.UTC(2026, 8, 10, 23, 59, 59, 999);

    process.env.TZ = 'UTC';
    const fromUtcHost = adapter.between(recurrence, config, from, to, TOKYO_CONTEXT);
    process.env.TZ = 'America/Los_Angeles';
    const fromLosAngelesHost = adapter.between(recurrence, config, from, to, TOKYO_CONTEXT);

    expect(fromLosAngelesHost).toEqual(fromUtcHost);
    expect(fromUtcHost.map((instant) => new Date(instant).toISOString())).toEqual([
      '2026-09-08T15:00:00.000Z',
      '2026-09-09T15:00:00.000Z',
    ]);
  });

});
