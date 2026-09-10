import { describe, expect, it } from 'vitest';
import { asYmd, createTimeContext, createTimeFacade } from '@memoflow/time';
import { Habit, calculateStreak, startOfLocalDay } from '../habit';

const UTC_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const UTC_TIME = createTimeFacade({ context: UTC_CONTEXT });

function addDays(instant: number, days: number): number {
  return Number(UTC_TIME.calendar.addDays(instant, days));
}

describe('calculateStreak (R4 Habit)', () => {
  it('returns zero streak for no completions', () => {
    expect(calculateStreak([], Date.now(), UTC_CONTEXT)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: null,
    });
  });

  it('counts consecutive completed days', () => {
    const base = startOfLocalDay(Date.now(), UTC_CONTEXT);
    const completed = [base, addDays(base, -1), addDays(base, -2)];
    const streak = calculateStreak(completed, base, UTC_CONTEXT);
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
    expect(streak.lastCheckInDate).toBe(base);
  });

  it('breaks current streak on a gap but keeps longest', () => {
    const base = startOfLocalDay(Date.now(), UTC_CONTEXT);
    const completed = [base, addDays(base, -2), addDays(base, -3), addDays(base, -4)];
    const streak = calculateStreak(completed, base, UTC_CONTEXT);
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(3);
  });

  it('breaks the current streak when the last completion is older than yesterday', () => {
    const base = startOfLocalDay(Date.now(), UTC_CONTEXT);
    const completed = [addDays(base, -2), addDays(base, -3), addDays(base, -4)];
    const streak = calculateStreak(completed, base, UTC_CONTEXT);
    expect(streak.currentStreak).toBe(0);
    expect(streak.longestStreak).toBe(3);
  });

  it('counts from yesterday when today is not yet completed', () => {
    const base = startOfLocalDay(Date.now(), UTC_CONTEXT);
    const completed = [addDays(base, -1), addDays(base, -2), addDays(base, -3)];
    const streak = calculateStreak(completed, base, UTC_CONTEXT);
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
  });

  it('deduplicates same-day completions', () => {
    const base = startOfLocalDay(Date.now(), UTC_CONTEXT);
    const streak = calculateStreak([base, base, addDays(base, -1)], base, UTC_CONTEXT);
    expect(streak.currentStreak).toBe(2);
  });

  it('treats the 23-hour spring-forward boundary as one calendar day', () => {
    const context = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const time = createTimeFacade({ context });
    const mar7 = Number(time.codec.startOfYmd(asYmd('2026-03-07')));
    const mar8 = Number(time.codec.startOfYmd(asYmd('2026-03-08')));
    const mar9 = Number(time.codec.startOfYmd(asYmd('2026-03-09')));

    expect(mar9 - mar8).toBe(23 * 60 * 60 * 1000);
    const streak = calculateStreak([mar7, mar8, mar9], mar9, context);
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
  });
});

describe('Habit aggregate', () => {
  it('creates occurrences idempotently for a date range', () => {
    const now = Date.now();
    const nextDay = addDays(now, 1);
    const habit = Habit.create({ identityId: 'u1', name: '早睡', timeContext: UTC_CONTEXT });
    const first = habit.ensureOccurrences(now, nextDay, now, UTC_CONTEXT);
    const second = habit.ensureOccurrences(now, nextDay, now, UTC_CONTEXT);

    expect(first.length).toBe(2);
    expect(second.length).toBe(0);
    expect(habit.occurrences.length).toBe(2);
  });

  it('generates every local date across a DST transition without 24-hour stepping', () => {
    const context = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const time = createTimeFacade({ context });
    const start = Number(time.codec.startOfYmd(asYmd('2026-03-07')));
    const end = Number(time.codec.startOfYmd(asYmd('2026-03-09')));
    const habit = Habit.create({ identityId: 'u1', name: '跑步', now: start, timeContext: context });

    const created = habit.ensureOccurrences(start, end, start, context);

    expect(created.map((item) => String(time.calendar.toYmd(item.occurrenceDate)))).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
    expect(created[2].occurrenceDate - created[1].occurrenceDate).toBe(23 * 60 * 60 * 1000);
  });

  it('check-in completes an occurrence and advances the streak', () => {
    const now = Date.now();
    const habit = Habit.create({ identityId: 'u1', name: '跑步', timeContext: UTC_CONTEXT });
    habit.ensureOccurrences(now, now, now, UTC_CONTEXT);
    const streak = habit.checkIn(now, now, UTC_CONTEXT);

    expect(streak.currentStreak).toBe(1);
    expect(habit.occurrences[0].status).toBe('Completed');
  });

  it('throws when checking in a missing occurrence', () => {
    const habit = Habit.create({ identityId: 'u1', name: '冥想', timeContext: UTC_CONTEXT });
    expect(() => habit.checkIn(Date.now(), Date.now(), UTC_CONTEXT)).toThrow(/No occurrence/);
  });
});
