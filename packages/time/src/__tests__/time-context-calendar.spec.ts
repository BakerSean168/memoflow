import { afterEach, describe, expect, it } from 'vitest';
import { asInstant, createTimeContext, createTimeFacade, requireTimeZoneId } from '../index';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function tokyoTime() {
  return createTimeFacade({
    context: createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
  });
}

describe('TIME-1203 timezone-aware Calendar/Input', () => {
  it('keeps calendar Ymd/day/week boundaries independent from the host timezone', () => {
    const instant = asInstant(Date.parse('2025-12-31T16:30:00.000Z'));

    process.env.TZ = 'UTC';
    const utcHost = tokyoTime();
    const utcHostResult = {
      ymd: utcHost.calendar.toYmd(instant),
      codecYmd: utcHost.codec.toYmd(instant),
      start: utcHost.calendar.startOfDay(instant),
      end: utcHost.calendar.endOfDay(instant),
      weekStart: utcHost.calendar.startOfWeek(instant),
      inputDate: utcHost.input.dateValue(instant),
      inputTime: utcHost.input.timeValue(instant),
    };

    process.env.TZ = 'America/Los_Angeles';
    const laHost = tokyoTime();
    const laHostResult = {
      ymd: laHost.calendar.toYmd(instant),
      codecYmd: laHost.codec.toYmd(instant),
      start: laHost.calendar.startOfDay(instant),
      end: laHost.calendar.endOfDay(instant),
      weekStart: laHost.calendar.startOfWeek(instant),
      inputDate: laHost.input.dateValue(instant),
      inputTime: laHost.input.timeValue(instant),
    };

    expect(utcHostResult).toEqual(laHostResult);
    expect(utcHostResult).toEqual({
      ymd: '2026-01-01',
      codecYmd: '2026-01-01',
      start: Date.parse('2025-12-31T15:00:00.000Z'),
      end: Date.parse('2026-01-01T14:59:59.999Z'),
      weekStart: Date.parse('2025-12-28T15:00:00.000Z'),
      inputDate: '2026-01-01',
      inputTime: '01:30',
    });
  });

  it('adds calendar days across DST while preserving local wall-clock time', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 }),
    });
    const saturdayMorning = asInstant(Date.parse('2026-03-07T14:15:30.250Z')); // 09:15:30.250 EST

    const sundayMorning = time.calendar.addDays(saturdayMorning, 1);

    expect(sundayMorning).toBe(Date.parse('2026-03-08T13:15:30.250Z')); // 09:15:30.250 EDT
    expect(sundayMorning - saturdayMorning).toBe(23 * 60 * 60 * 1000);
    expect(time.calendar.diffCalendarDays(sundayMorning, saturdayMorning)).toBe(1);
    expect(time.input.timeValue(sundayMorning)).toBe('09:15');
  });

  it('uses actual DST-short day boundaries instead of assuming 24 hours', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 }),
    });
    const noon = asInstant(Date.parse('2026-03-08T16:00:00.000Z'));
    const start = time.calendar.startOfDay(noon);
    const end = time.calendar.endOfDay(noon);

    expect(start).toBe(Date.parse('2026-03-08T05:00:00.000Z'));
    expect(end).toBe(Date.parse('2026-03-09T03:59:59.999Z'));
    expect(end - start + 1).toBe(23 * 60 * 60 * 1000);
  });

  it('keeps the product wall-clock policy explicit and aligned with recurrence semantics', async () => {
    const { WALL_CLOCK_RESOLUTION_POLICY, combineYmdHmWithTimeZone, asYmd, asHm } =
      await import('../index');
    const zone = requireTimeZoneId('America/New_York');

    expect(WALL_CLOCK_RESOLUTION_POLICY).toEqual({
      nonexistent: 'shift-forward',
      ambiguous: 'earlier',
    });
    expect(combineYmdHmWithTimeZone(asYmd('2026-03-08'), asHm('02:30'), zone)).toBe(
      Date.parse('2026-03-08T07:30:00.000Z'),
    );
    expect(combineYmdHmWithTimeZone(asYmd('2026-11-01'), asHm('01:30'), zone)).toBe(
      Date.parse('2026-11-01T05:30:00.000Z'),
    );
  });
});
