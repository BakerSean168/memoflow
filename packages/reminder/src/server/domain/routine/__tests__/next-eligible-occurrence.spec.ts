import { describe, expect, it } from 'vitest';
import { asInstant, createRecurrenceEngine } from '@memoflow/time';
import {
  computeRoutineNextEligibleOccurrence,
  createSnoozeOverride,
  createWallClockTrigger,
} from '..';

const engine = createRecurrenceEngine();

function dailyAt(
  localTime: string,
  timeZone: string,
  startDate: string,
  options?: {
    count?: number | null;
  },
) {
  return createWallClockTrigger({
    localTime,
    timeZone,
    recurrence: {
      startDate,
      frequency: 'daily',
      interval: 1,
      count: options?.count ?? null,
      byWeekday: [],
    },
  });
}

describe('computeRoutineNextEligibleOccurrence (Fixture F durable wall-clock)', () => {
  it('resolves the next 23:30 occurrence in a non-UTC IANA timezone', () => {
    const trigger = dailyAt('23:30', 'Asia/Shanghai', '2026-08-25');
    const after = asInstant(Date.parse('2026-08-25T07:00:00.000Z'));

    const occurrence = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after,
    });

    // 23:30 Asia/Shanghai == 15:30 UTC (UTC+8, no DST).
    expect(occurrence).not.toBeNull();
    expect(Number(occurrence!.occurrenceAt)).toBe(Date.parse('2026-08-25T15:30:00.000Z'));
    expect(occurrence!.occurrenceKey).toBe(
      `routine:RoutineId_fixture-f:oc:${Date.parse('2026-08-25T15:30:00.000Z')}`,
    );
  });

  it('skips candidates inside an active snooze window without duplicating the fired occurrence', () => {
    const trigger = dailyAt('23:30', 'Asia/Shanghai', '2026-08-25');
    const after = asInstant(Date.parse('2026-08-25T07:00:00.000Z'));
    // Snooze through 00:00 local (16:00 UTC): blocks 2026-08-25 23:30 local.
    const snooze = createSnoozeOverride({
      now: Date.parse('2026-08-25T07:00:00.000Z'),
      durationMs: 9 * 60 * 60_000,
      reason: 'fixture snooze',
    });

    const occurrence = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after,
      temporaryOverride: snooze,
    });

    // The snoozed occurrence candidate (08-25 23:30 local) is skipped; the next
    // eligible durable invocation is the following day's 23:30 local.
    expect(occurrence).not.toBeNull();
    expect(Number(occurrence!.occurrenceAt)).toBe(Date.parse('2026-08-26T15:30:00.000Z'));
  });

  it('treats expired snooze overrides as neutral', () => {
    const trigger = dailyAt('23:30', 'Asia/Shanghai', '2026-08-25');
    const after = asInstant(Date.parse('2026-08-25T07:00:00.000Z'));
    const snooze = createSnoozeOverride({
      now: Date.parse('2026-08-24T07:00:00.000Z'),
      durationMs: 60_000,
      reason: 'already expired',
    });

    const occurrence = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after,
      temporaryOverride: snooze,
    });

    expect(occurrence).not.toBeNull();
    expect(Number(occurrence!.occurrenceAt)).toBe(Date.parse('2026-08-25T15:30:00.000Z'));
  });

  it('returns null when the recurrence is exhausted (count reached)', () => {
    const trigger = dailyAt('23:30', 'Asia/Shanghai', '2026-08-25', { count: 1 });
    const after = asInstant(Date.parse('2026-08-25T07:00:00.000Z'));

    // First occurrence is eligible; the recurrence terminates after it.
    const first = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after,
    });
    expect(Number(first!.occurrenceAt)).toBe(Date.parse('2026-08-25T15:30:00.000Z'));

    const exhausted = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after: asInstant(Date.parse('2026-08-25T16:00:00.000Z')),
    });
    expect(exhausted).toBeNull();
  });

  it('uses a stable canonical occurrence key per scheduled instant', () => {
    const trigger = dailyAt('23:30', 'Asia/Shanghai', '2026-08-25');
    const occurrence = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after: asInstant(Date.parse('2026-08-25T07:00:00.000Z')),
    });

    const sameInstant = computeRoutineNextEligibleOccurrence({
      routineId: 'RoutineId_fixture-f',
      engine,
      trigger,
      after: asInstant(Date.parse('2026-08-25T08:00:00.000Z')),
    });

    // Same wall-clock instant projects the same key regardless of the horizon.
    expect(occurrence!.occurrenceKey).toBe(sameInstant!.occurrenceKey);
  });
});
