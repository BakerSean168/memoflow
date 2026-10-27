import { describe, expect, it } from 'vitest';
import { asInstant } from '@memoflow/time';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createSnoozeOverride,
  createWallClockTrigger,
} from '../../domain/routine';
import {
  deserializeRoutineTemporaryOverride,
  deserializeRoutineTrigger,
  serializeRoutineTemporaryOverride,
  serializeRoutineTrigger,
} from './trigger-persistence-parity';

describe('Routine trigger persistence parity', () => {
  it.each([
    createWallClockTrigger({
      localTime: '15:00',
      timeZone: 'Asia/Tokyo',
      recurrence: {
        startDate: '2026-08-25',
        frequency: 'weekly',
        byWeekday: [1, 3, 5],
        count: 8,
      },
    }),
    createElapsedTrigger({ durationMs: 40 * 60_000, anchor: 'profile-activation' }),
    createActiveUsageTrigger({
      requiredActiveMs: 40 * 60_000,
      naturalBreakCredit: { idleDurationMs: 5 * 60_000 },
      protocolBreakCredit: { kind: 'Movement', minimumBreakMs: 3 * 60_000 },
    }),
  ])('round-trips %s without losing timing ownership', (trigger) => {
    const restored = deserializeRoutineTrigger(serializeRoutineTrigger(trigger));
    expect(restored).toEqual(trigger);
    expect(restored?.timingOwner).toBe(trigger.timingOwner);
  });

  it('normalizes legacy Elapsed timingOwner from anchor semantics on read', () => {
    expect(
      deserializeRoutineTrigger(
        JSON.stringify({
          type: 'Elapsed',
          timingOwner: 'local-runtime',
          durationMs: 50 * 60_000,
          anchor: 'last-satisfied',
        }),
      ),
    ).toEqual({
      type: 'Elapsed',
      timingOwner: 'scheduler',
      durationMs: 50 * 60_000,
      anchor: 'last-satisfied',
    });
  });

  it('rejects an unknown persisted protocol-break capability instead of guessing from the routine name', () => {
    expect(() =>
      deserializeRoutineTrigger(
        JSON.stringify({
          type: 'ActiveUsage',
          timingOwner: 'local-runtime',
          requiredActiveMs: 1_000,
          anchor: 'last-satisfied',
          naturalBreakCredit: null,
          protocolBreakCredit: { kind: 'Drink', minimumBreakMs: 1_000 },
        }),
      ),
    ).toThrow('ActiveUsage.protocolBreakCredit.kind is invalid');
  });

  it('round-trips temporary snooze as runtime state without a trigger rewrite', () => {
    const now = asInstant(Date.parse('2026-08-25T16:00:00.000Z'));
    const override = createSnoozeOverride({
      now,
      durationMs: 20 * 60_000,
      reason: '20 more minutes',
    });

    expect(
      deserializeRoutineTemporaryOverride(serializeRoutineTemporaryOverride(override)),
    ).toEqual(override);
  });

  it('rejects invalid persisted trigger data instead of casting across the trust boundary', () => {
    expect(() =>
      deserializeRoutineTrigger(
        JSON.stringify({
          type: 'WallClock',
          localTime: '99:99',
          timeZone: 'Asia/Tokyo',
          recurrence: {
            startDate: '2026-08-25',
            frequency: 'daily',
            interval: 1,
            byWeekday: [],
            count: null,
            until: null,
          },
        }),
      ),
    ).toThrow('Invalid local time');
    expect(() => deserializeRoutineTrigger(JSON.stringify({ type: 'Protocol' }))).toThrow(
      'Unsupported persisted RoutineTrigger type',
    );
  });
});
