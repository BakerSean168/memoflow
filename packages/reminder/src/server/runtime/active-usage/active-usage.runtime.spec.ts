import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import { createActiveUsageTrigger, createSnoozeOverride } from '../../domain/routine';
import { FakeActivitySensor } from '../routine-activity';
import { createActiveUsageRuntime } from './active-usage.runtime';

const minute = 60_000;
const base = Date.parse('2026-08-27T00:00:00.000Z');

function createHarness(options?: { naturalBreakMs?: number | null }) {
  const activitySensor = new FakeActivitySensor(base);
  const due = vi.fn();
  const naturalBreak = vi.fn();
  let now = base;
  const runtime = createActiveUsageRuntime({
    activitySensor,
    onOccurrenceDue: due,
    onNaturalBreakSatisfied: naturalBreak,
    now: () => now,
    tickIntervalMs: 60 * minute,
  });
  runtime.registerRoutine({
    identityId: 'identity-1',
    routineId: 'stand-40m',
    trigger: createActiveUsageTrigger({
      requiredActiveMs: 40 * minute,
      naturalBreakCredit:
        options?.naturalBreakMs === null
          ? null
          : { idleDurationMs: options?.naturalBreakMs ?? 6 * minute },
    }),
    gates: {
      routineEnabled: true,
      profileEnabled: true,
      profileEnabled: true,
      membershipEnabled: true,
    },
  });
  runtime.start();
  return {
    activitySensor,
    due,
    naturalBreak,
    runtime,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('ActiveUsage local runtime (ROUTINE-4102)', () => {
  it('Fixture G: 40m active -> due, then a 6m natural break satisfies and resets without duplicate occurrence', () => {
    const h = createHarness();
    h.runtime.advance(asInstant(base + 40 * minute));

    expect(h.due).toHaveBeenCalledTimes(1);
    expect(h.due.mock.calls[0]?.[0]).toMatchObject({
      routineId: 'stand-40m',
      occurrenceKey: 'routine:stand-40m:active-usage:1',
      generation: 1,
      accumulatedActiveMs: 40 * minute,
    });

    // The idle event is observed at +46m and says the last user input was +40m.
    // The 6m detection/rest window must not add active time.
    h.activitySensor.emit({
      type: 'UserIdle',
      at: asInstant(base + 46 * minute),
      idleDurationMs: 6 * minute,
    });
    h.activitySensor.emit({
      type: 'UserResumed',
      at: asInstant(base + 46 * minute),
      idleDurationMs: 6 * minute,
    });

    expect(h.naturalBreak).toHaveBeenCalledTimes(1);
    h.activitySensor.emit({
      type: 'UserResumed',
      at: asInstant(base + 46 * minute),
      idleDurationMs: 6 * minute,
    });
    expect(h.naturalBreak).toHaveBeenCalledTimes(1);
    expect(h.naturalBreak.mock.calls[0]?.[0]).toMatchObject({
      occurrenceKey: 'routine:stand-40m:active-usage:1',
      generation: 1,
      idleDurationMs: 6 * minute,
    });
    expect(h.runtime.getSnapshot('identity-1', 'stand-40m')).toMatchObject({
      accumulatedActiveMs: 0,
      generation: 2,
      thresholdSignaled: false,
    });

    h.runtime.advance(asInstant(base + 60 * minute));
    expect(h.due).toHaveBeenCalledTimes(1);
    h.runtime.stop();
  });

  it('does not count idle time and does not credit a short idle as Natural Break', () => {
    const h = createHarness();
    h.runtime.advance(asInstant(base + 20 * minute));
    h.activitySensor.emit({
      type: 'UserIdle',
      at: asInstant(base + 22 * minute),
      idleDurationMs: 2 * minute,
    });
    h.activitySensor.emit({
      type: 'UserResumed',
      at: asInstant(base + 32 * minute),
      idleDurationMs: 10 * minute,
    });

    // A 10m idle qualifies on resume, so the prior 20m active segment is reset.
    expect(h.naturalBreak).toHaveBeenCalledTimes(1);
    expect(h.runtime.getSnapshot('identity-1', 'stand-40m')?.accumulatedActiveMs).toBe(0);

    h.runtime.advance(asInstant(base + 52 * minute));
    expect(h.due).not.toHaveBeenCalled();
    h.runtime.stop();
  });

  it('profile deactivation pauses the accumulator without resetting earned active usage', () => {
    const h = createHarness({ naturalBreakMs: null });
    h.runtime.advance(asInstant(base + 20 * minute));
    h.runtime.updateGates({
      identityId: 'identity-1',
      routineId: 'stand-40m',
      at: asInstant(base + 20 * minute),
      gates: {
        routineEnabled: true,
        profileEnabled: false,
        membershipEnabled: true,
      },
    });
    h.runtime.advance(asInstant(base + 50 * minute));
    expect(h.runtime.getSnapshot('identity-1', 'stand-40m')?.accumulatedActiveMs).toBe(20 * minute);

    h.runtime.updateGates({
      identityId: 'identity-1',
      routineId: 'stand-40m',
      at: asInstant(base + 50 * minute),
      gates: {
        routineEnabled: true,
        profileEnabled: true,
        membershipEnabled: true,
      },
    });
    h.runtime.advance(asInstant(base + 70 * minute));
    expect(h.due).toHaveBeenCalledTimes(1);
    h.runtime.stop();
  });

  it('temporary suppression closes the same effective gate and avoids a due occurrence while active', () => {
    const h = createHarness({ naturalBreakMs: null });
    h.runtime.advance(asInstant(base + 15 * minute));
    h.runtime.updateGates({
      identityId: 'identity-1',
      routineId: 'stand-40m',
      at: asInstant(base + 15 * minute),
      gates: {
        routineEnabled: true,
        profileEnabled: true,
        membershipEnabled: true,
        temporaryOverride: createSnoozeOverride({
          now: asInstant(base + 15 * minute),
          durationMs: 30 * minute,
          reason: 'meeting',
          source: 'user',
        }),
      },
    });
    h.runtime.advance(asInstant(base + 45 * minute));
    expect(h.due).not.toHaveBeenCalled();
    expect(h.runtime.getSnapshot('identity-1', 'stand-40m')?.accumulatedActiveMs).toBe(15 * minute);

    // Once the override expires, only newly active time resumes accumulation.
    h.runtime.advance(asInstant(base + 70 * minute));
    expect(h.due).toHaveBeenCalledTimes(1);
    h.runtime.stop();
  });

  it('restores an accumulator snapshot without counting process downtime', () => {
    const first = createHarness({ naturalBreakMs: null });
    first.runtime.advance(asInstant(base + 25 * minute));
    const snapshot = first.runtime.getSnapshot('identity-1', 'stand-40m')!;
    first.setNow(base + 25 * minute);
    first.runtime.stop();

    const sensor = new FakeActivitySensor(base + 2 * 60 * minute);
    const due = vi.fn();
    let now = base + 2 * 60 * minute;
    const restarted = createActiveUsageRuntime({
      activitySensor: sensor,
      onOccurrenceDue: due,
      now: () => now,
      tickIntervalMs: 60 * minute,
    });
    restarted.registerRoutine({
      identityId: 'identity-1',
      routineId: 'stand-40m',
      trigger: createActiveUsageTrigger({ requiredActiveMs: 40 * minute }),
      gates: { routineEnabled: true, profileEnabled: true },
      restoredSnapshot: snapshot,
    });
    restarted.start();
    now += 15 * minute;
    restarted.advance(asInstant(now));

    expect(due).toHaveBeenCalledTimes(1);
    expect(due.mock.calls[0]?.[0]).toMatchObject({
      generation: 1,
      accumulatedActiveMs: 40 * minute,
    });
    restarted.stop();
  });
});
