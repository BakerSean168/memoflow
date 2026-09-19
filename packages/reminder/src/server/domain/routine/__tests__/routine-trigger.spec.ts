import { describe, expect, it, vi } from 'vitest';
import { asInstant, type RecurrenceEnginePort } from '@memoflow/time';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createSnoozeOverride,
  createTemporaryOverride,
  createWallClockTrigger,
  nextWallClockOccurrence,
  requiresDurableScheduleProjection,
  ROUTINE_TRIGGER_TYPES,
  RoutineDefinition,
  temporaryOverrideAllowsExecution,
  timingOwnerOf,
  wallClockOccurrencesBetween,
} from '..';

describe('Routine canonical trigger model', () => {
  it('has exactly WallClock / Elapsed / ActiveUsage and keeps Protocol out of Trigger', () => {
    expect(ROUTINE_TRIGGER_TYPES).toEqual(['WallClock', 'Elapsed', 'ActiveUsage']);
    expect(ROUTINE_TRIGGER_TYPES).not.toContain('Protocol' as never);
  });

  it('builds WallClock from product time primitives and rejects invalid local time/timezone', () => {
    const trigger = createWallClockTrigger({
      localTime: '15:00',
      timeZone: 'Asia/Tokyo',
      recurrence: {
        startDate: '2026-08-25',
        frequency: 'daily',
      },
    });

    expect(trigger).toMatchObject({
      type: 'WallClock',
      timingOwner: 'scheduler',
      localTime: '15:00',
      timeZone: 'Asia/Tokyo',
      recurrence: {
        startDate: '2026-08-25',
        frequency: 'daily',
        interval: 1,
        byWeekday: [],
        count: null,
        until: null,
      },
    });

    expect(() =>
      createWallClockTrigger({
        localTime: '25:00',
        timeZone: 'Asia/Tokyo',
        recurrence: { startDate: '2026-08-25', frequency: 'daily' },
      }),
    ).toThrow('Invalid local time');
    expect(() =>
      createWallClockTrigger({
        localTime: '15:00',
        timeZone: 'local',
        recurrence: { startDate: '2026-08-25', frequency: 'daily' },
      }),
    ).toThrow('Invalid IANA time zone');
  });

  it('delegates WallClock occurrence calculation to RecurrenceEnginePort without owning recurrence math', () => {
    const expectedNext = asInstant(Date.parse('2026-08-26T06:00:00.000Z'));
    const expectedBetween = [expectedNext, asInstant(Date.parse('2026-08-27T06:00:00.000Z'))];
    const next = vi.fn(() => expectedNext);
    const between = vi.fn(() => expectedBetween);
    const engine: RecurrenceEnginePort = { next, between };
    const trigger = createWallClockTrigger({
      localTime: '15:00',
      timeZone: 'Asia/Tokyo',
      recurrence: {
        startDate: '2026-08-25',
        frequency: 'daily',
        interval: 1,
      },
    });
    const after = asInstant(Date.parse('2026-08-25T07:00:00.000Z'));
    const to = asInstant(Date.parse('2026-08-28T00:00:00.000Z'));

    expect(nextWallClockOccurrence(engine, trigger, after)).toBe(expectedNext);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-08-25',
        localTime: '15:00',
        timeZone: 'Asia/Tokyo',
        frequency: 'daily',
      }),
      after,
      false,
    );

    expect(
      wallClockOccurrencesBetween(engine, trigger, { from: after, to, inclusive: true }),
    ).toEqual(expectedBetween);
    expect(between).toHaveBeenCalledWith(
      expect.objectContaining({ localTime: '15:00', timeZone: 'Asia/Tokyo' }),
      { from: after, to, inclusive: true },
    );
  });

  it('encodes timing ownership so only WallClock can become a durable Schedule projection', () => {
    const wallClock = createWallClockTrigger({
      localTime: '07:30',
      timeZone: 'Asia/Shanghai',
      recurrence: { startDate: '2026-08-25', frequency: 'daily' },
    });
    const elapsed = createElapsedTrigger({ durationMs: 60 * 60_000 });
    const activeUsage = createActiveUsageTrigger({
      requiredActiveMs: 40 * 60_000,
      naturalBreakCredit: { idleDurationMs: 5 * 60_000 },
    });

    expect(timingOwnerOf(wallClock)).toBe('scheduler');
    expect(requiresDurableScheduleProjection(wallClock)).toBe(true);
    expect(timingOwnerOf(elapsed)).toBe('local-runtime');
    expect(requiresDurableScheduleProjection(elapsed)).toBe(false);
    expect(timingOwnerOf(activeUsage)).toBe('local-runtime');
    expect(requiresDurableScheduleProjection(activeUsage)).toBe(false);
    expect(activeUsage.naturalBreakCredit).toEqual({
      idleDurationMs: 5 * 60_000,
      effect: 'satisfy-and-reset',
    });
  });

  it('stores explicit protocol-break compatibility on ActiveUsage without routine-name inference', () => {
    const trigger = createActiveUsageTrigger({
      requiredActiveMs: 40 * 60_000,
      protocolBreakCredit: { kind: 'Eye', minimumBreakMs: 20_000 },
    });

    expect(trigger.protocolBreakCredit).toEqual({ kind: 'Eye', minimumBreakMs: 20_000 });
    expect(() =>
      createActiveUsageTrigger({
        requiredActiveMs: 40 * 60_000,
        protocolBreakCredit: { kind: 'Hydration' as never, minimumBreakMs: 20_000 },
      }),
    ).toThrow('Invalid protocol break credit kind');
    expect(() =>
      createActiveUsageTrigger({
        requiredActiveMs: 40 * 60_000,
        protocolBreakCredit: { kind: 'Stand', minimumBreakMs: 0 },
      }),
    ).toThrow('protocolBreakCredit.minimumBreakMs');
  });

  it('stores the trigger on RoutineDefinition as domain truth', () => {
    const elapsed = createElapsedTrigger({ durationMs: 40 * 60_000 });
    const routine = RoutineDefinition.create({
      id: 'hydrate',
      identityId: 'identity-1',
      name: 'Hydrate',
      trigger: elapsed,
    });

    expect(routine.trigger).toBe(elapsed);
    const initialVersion = routine.version;
    const activeUsage = createActiveUsageTrigger({ requiredActiveMs: 40 * 60_000 });
    routine.setTrigger(activeUsage, new Date('2026-08-25T16:00:00.000Z'));
    expect(routine.trigger).toBe(activeUsage);
    expect(routine.version).toBe(initialVersion + 1);
  });

  it('models snooze as temporary state without rewriting the long-lived WallClock rule', () => {
    const trigger = createWallClockTrigger({
      localTime: '23:30',
      timeZone: 'Asia/Shanghai',
      recurrence: { startDate: '2026-08-25', frequency: 'daily' },
    });
    const originalLocalTime = trigger.localTime;
    const now = asInstant(Date.parse('2026-08-25T15:30:00.000Z'));
    const override = createSnoozeOverride({
      now,
      durationMs: 20 * 60_000,
      reason: 'Play 20 more minutes',
    });

    expect(temporaryOverrideAllowsExecution(override, now)).toBe(false);
    expect(temporaryOverrideAllowsExecution(override, asInstant(Number(now) + 20 * 60_000))).toBe(
      true,
    );
    expect(trigger.localTime).toBe(originalLocalTime);
    expect(trigger.localTime).toBe('23:30');
  });

  it('rejects temporary overrides whose effect outlives expiry or has no effect', () => {
    const now = asInstant(Date.parse('2026-08-25T15:30:00.000Z'));
    expect(() =>
      createTemporaryOverride({
        snoozeUntil: asInstant(Number(now) + 30 * 60_000),
        expiresAt: asInstant(Number(now) + 20 * 60_000),
        reason: 'invalid snooze',
        source: 'user',
      }),
    ).toThrow('snoozeUntil must not exceed expiresAt');
    expect(() =>
      createTemporaryOverride({
        expiresAt: asInstant(Number(now) + 20 * 60_000),
        reason: 'no-op',
        source: 'runtime',
      }),
    ).toThrow('must define at least one temporary effect');
  });

});
