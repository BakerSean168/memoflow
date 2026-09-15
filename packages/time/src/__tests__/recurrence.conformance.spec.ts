import { describe, expect, it } from 'vitest';
import {
  asHm,
  asInstant,
  asYmd,
  requireTimeZoneId,
  type RecurrenceEnginePort,
  type RecurrenceSchedule,
} from '../index';
import { createRRuleRecurrenceEngine } from '../recurrence/rrule-recurrence-engine';

const instant = (iso: string) => asInstant(Date.parse(iso));
const iso = (values: readonly number[]) => values.map((value) => new Date(value).toISOString());

type RecurrenceScheduleOverrides = Omit<Partial<RecurrenceSchedule>, 'timeZone'> &
  Pick<RecurrenceSchedule, 'startDate' | 'frequency'> & { timeZone?: string };

function schedule(overrides: RecurrenceScheduleOverrides): RecurrenceSchedule {
  return {
    startDate: overrides.startDate,
    localTime: overrides.localTime ?? asHm('09:00'),
    timeZone: requireTimeZoneId(overrides.timeZone ?? 'UTC'),
    frequency: overrides.frequency,
    interval: overrides.interval ?? 1,
    byWeekday: overrides.byWeekday ?? [],
    count: overrides.count ?? null,
    until: overrides.until ?? null,
  };
}

function conformanceSuite(name: string, createEngine: () => RecurrenceEnginePort): void {
  describe(name, () => {
    const between = (recurrence: RecurrenceSchedule, from: string, to: string): string[] => {
      const engine = createEngine();
      return iso(
        engine.between(recurrence, {
          from: instant(from),
          to: instant(to),
          inclusive: true,
        }),
      );
    };

    it('Daily', () => {
      expect(
        between(
          schedule({ startDate: asYmd('2026-01-01'), frequency: 'daily' }),
          '2026-01-01T00:00:00.000Z',
          '2026-01-03T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-01-01T09:00:00.000Z',
        '2026-01-02T09:00:00.000Z',
        '2026-01-03T09:00:00.000Z',
      ]);
    });

    it('interval > 1', () => {
      expect(
        between(
          schedule({ startDate: asYmd('2026-01-01'), frequency: 'daily', interval: 2 }),
          '2026-01-01T00:00:00.000Z',
          '2026-01-07T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-01-01T09:00:00.000Z',
        '2026-01-03T09:00:00.000Z',
        '2026-01-05T09:00:00.000Z',
        '2026-01-07T09:00:00.000Z',
      ]);
    });

    it('Weekly + BYDAY', () => {
      expect(
        between(
          schedule({
            startDate: asYmd('2026-08-24'),
            frequency: 'weekly',
            byWeekday: [1, 3],
          }),
          '2026-08-24T00:00:00.000Z',
          '2026-09-03T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-08-24T09:00:00.000Z',
        '2026-08-26T09:00:00.000Z',
        '2026-08-31T09:00:00.000Z',
        '2026-09-02T09:00:00.000Z',
      ]);
    });

    it('Monthly preserves RFC month-day semantics at month end', () => {
      expect(
        between(
          schedule({ startDate: asYmd('2026-01-31'), frequency: 'monthly' }),
          '2026-01-01T00:00:00.000Z',
          '2026-08-31T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-01-31T09:00:00.000Z',
        '2026-03-31T09:00:00.000Z',
        '2026-05-31T09:00:00.000Z',
        '2026-07-31T09:00:00.000Z',
        '2026-08-31T09:00:00.000Z',
      ]);
    });

    it('Yearly preserves leap-day semantics', () => {
      expect(
        between(
          schedule({ startDate: asYmd('2024-02-29'), frequency: 'yearly' }),
          '2024-01-01T00:00:00.000Z',
          '2032-12-31T23:59:59.999Z',
        ),
      ).toEqual([
        '2024-02-29T09:00:00.000Z',
        '2028-02-29T09:00:00.000Z',
        '2032-02-29T09:00:00.000Z',
      ]);
    });

    it('COUNT produces a finite recurrence plan', () => {
      expect(
        between(
          schedule({ startDate: asYmd('2026-01-01'), frequency: 'daily', count: 3 }),
          '2026-01-01T00:00:00.000Z',
          '2026-01-31T23:59:59.999Z',
        ),
      ).toHaveLength(3);
    });

    it('UNTIL is an inclusive Instant boundary', () => {
      expect(
        between(
          schedule({
            startDate: asYmd('2026-01-01'),
            frequency: 'daily',
            until: instant('2026-01-03T23:59:59.999Z'),
          }),
          '2026-01-01T00:00:00.000Z',
          '2026-01-10T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-01-01T09:00:00.000Z',
        '2026-01-02T09:00:00.000Z',
        '2026-01-03T09:00:00.000Z',
      ]);
    });

    it('preserves a Tokyo wall-clock time', () => {
      expect(
        between(
          schedule({
            startDate: asYmd('2026-01-01'),
            frequency: 'daily',
            timeZone: 'Asia/Tokyo',
          }),
          '2025-12-31T00:00:00.000Z',
          '2026-01-03T00:00:00.000Z',
        ),
      ).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        '2026-01-03T00:00:00.000Z',
      ]);
    });

    it('keeps 09:00 America/New_York across spring DST', () => {
      expect(
        between(
          schedule({
            startDate: asYmd('2026-03-07'),
            frequency: 'daily',
            timeZone: 'America/New_York',
            count: 4,
          }),
          '2026-03-07T00:00:00.000Z',
          '2026-03-11T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-03-07T14:00:00.000Z',
        '2026-03-08T13:00:00.000Z',
        '2026-03-09T13:00:00.000Z',
        '2026-03-10T13:00:00.000Z',
      ]);
    });

    it('keeps 09:00 America/New_York across fall DST', () => {
      expect(
        between(
          schedule({
            startDate: asYmd('2026-10-31'),
            frequency: 'daily',
            timeZone: 'America/New_York',
            count: 4,
          }),
          '2026-10-31T00:00:00.000Z',
          '2026-11-04T23:59:59.999Z',
        ),
      ).toEqual([
        '2026-10-31T13:00:00.000Z',
        '2026-11-01T14:00:00.000Z',
        '2026-11-02T14:00:00.000Z',
        '2026-11-03T14:00:00.000Z',
      ]);
    });

    it('next returns the first standard recurrence strictly after a boundary', () => {
      const engine = createEngine();
      const recurrence = schedule({
        startDate: asYmd('2026-01-31'),
        frequency: 'monthly',
      });
      expect(
        new Date(engine.next(recurrence, instant('2026-01-31T09:00:00.000Z'))!).toISOString(),
      ).toBe('2026-03-31T09:00:00.000Z');
    });
  });
}

conformanceSuite('rrule adapter conformance (TIME-1102)', createRRuleRecurrenceEngine);
