import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import { createElapsedTrigger, createSnoozeOverride } from '../../domain/routine';
import { createElapsedRuntime } from './elapsed.runtime';

const t0 = Date.parse('2026-09-17T00:00:00.000Z');

function noTimer() {
  return {
    setInterval: (() => ({ unref() {} })) as unknown as typeof globalThis.setInterval,
    clearInterval: vi.fn() as unknown as typeof globalThis.clearInterval,
  };
}

describe('ElapsedRuntime', () => {
  it('keeps routine-activation fixed and advances a stable generation after satisfaction', () => {
    const due = vi.fn();
    const runtime = createElapsedRuntime({ onOccurrenceDue: due, now: () => t0, ...noTimer() });
    runtime.registerRoutine({
      identityId: 'i-1',
      routineId: 'r-1',
      trigger: createElapsedTrigger({ durationMs: 60_000, anchor: 'routine-activation' }),
      gates: { routineEnabled: true },
      durableAnchorAt: asInstant(t0),
      durableAnchorRevision: 'definition-3',
    });

    runtime.advance(asInstant(t0 + 59_999));
    expect(due).not.toHaveBeenCalled();
    runtime.advance(asInstant(t0 + 60_000));
    runtime.advance(asInstant(t0 + 120_000));
    expect(due).toHaveBeenCalledTimes(1);
    expect(due).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceKey: 'routine:r-1:elapsed:definition-3:1',
        anchorRevision: 'definition-3',
        generation: 1,
        dueAt: t0 + 60_000,
      }),
    );

    // Late completion at 130s must preserve routine activation. The 120s
    // boundary is already in the past, so the next generation is the 180s slot.
    expect(
      runtime.markSatisfied({ identityId: 'i-1', routineId: 'r-1', at: t0 + 130_000 }),
    ).toMatchObject({
      occurrenceKey: 'routine:r-1:elapsed:definition-3:1',
      previousAnchorRevision: 'definition-3',
      completedGeneration: 1,
      nextAnchorRevision: 'definition-3',
      nextGeneration: 3,
    });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: t0,
      anchorRevision: 'definition-3',
      generation: 3,
      thresholdSignaled: false,
    });

    runtime.advance(asInstant(t0 + 179_999));
    expect(due).toHaveBeenCalledTimes(1);
    runtime.advance(asInstant(t0 + 180_000));
    expect(due).toHaveBeenCalledTimes(2);
    expect(due.mock.calls[1]?.[0]).toMatchObject({
      occurrenceKey: 'routine:r-1:elapsed:definition-3:3',
      generation: 3,
      dueAt: t0 + 180_000,
    });
  });

  it('resets the business anchor only for last-satisfied', () => {
    const due = vi.fn();
    const runtime = createElapsedRuntime({ onOccurrenceDue: due, now: () => t0, ...noTimer() });
    runtime.registerRoutine({
      identityId: 'i-1',
      routineId: 'r-1',
      trigger: createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' }),
      gates: { routineEnabled: true },
      durableAnchorAt: asInstant(t0),
      durableAnchorRevision: 'definition-1',
    });

    runtime.advance(asInstant(t0 + 60_000));
    expect(due).toHaveBeenCalledWith(
      expect.objectContaining({ occurrenceKey: 'routine:r-1:elapsed:definition-1:1' }),
    );

    const satisfiedAt = t0 + 70_000;
    expect(runtime.markSatisfied({ identityId: 'i-1', routineId: 'r-1', at: satisfiedAt }))
      .toMatchObject({
        occurrenceKey: 'routine:r-1:elapsed:definition-1:1',
        completedGeneration: 1,
        nextAnchorRevision: `satisfied-${satisfiedAt}`,
        nextGeneration: 1,
      });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: satisfiedAt,
      anchorRevision: `satisfied-${satisfiedAt}`,
      generation: 1,
    });

    runtime.advance(asInstant(satisfiedAt + 60_000));
    expect(due.mock.calls[1]?.[0]).toMatchObject({
      occurrenceKey: `routine:r-1:elapsed:satisfied-${satisfiedAt}:1`,
      generation: 1,
    });
  });

  it('keeps a profile-activation anchor for the session and creates a new one on reactivation', () => {
    let now = t0;
    const due = vi.fn();
    const runtime = createElapsedRuntime({ onOccurrenceDue: due, now: () => now, ...noTimer() });
    const trigger = createElapsedTrigger({ durationMs: 60_000, anchor: 'profile-activation' });
    runtime.registerRoutine({
      identityId: 'i-1',
      routineId: 'r-1',
      trigger,
      gates: { routineEnabled: true, profileEnabled: false, membershipEnabled: false },
    });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: null,
      anchorRevision: null,
      generation: 1,
    });

    now = t0 + 10_000;
    runtime.updateGates({
      identityId: 'i-1',
      routineId: 'r-1',
      gates: { routineEnabled: true, profileEnabled: true, membershipEnabled: true },
      at: now,
    });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: t0 + 10_000,
      anchorRevision: `profile-${t0 + 10_000}`,
      generation: 1,
    });

    runtime.advance(asInstant(t0 + 70_000));
    expect(due).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceKey: `routine:r-1:elapsed:profile-${t0 + 10_000}:1`,
      }),
    );
    expect(runtime.markSatisfied({ identityId: 'i-1', routineId: 'r-1', at: t0 + 75_000 }))
      .toMatchObject({
        nextAnchorRevision: `profile-${t0 + 10_000}`,
        nextGeneration: 2,
      });

    runtime.updateGates({
      identityId: 'i-1',
      routineId: 'r-1',
      gates: { routineEnabled: true, profileEnabled: false, membershipEnabled: false },
      at: t0 + 76_000,
    });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: null,
      anchorRevision: null,
      generation: 1,
      thresholdSignaled: false,
    });

    now = t0 + 90_000;
    runtime.updateGates({
      identityId: 'i-1',
      routineId: 'r-1',
      gates: { routineEnabled: true, profileEnabled: true, membershipEnabled: true },
      at: now,
    });
    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: t0 + 90_000,
      anchorRevision: `profile-${t0 + 90_000}`,
      generation: 1,
    });
  });

  it('delays due emission behind a temporary override without changing the business boundary', () => {
    const due = vi.fn();
    const runtime = createElapsedRuntime({ onOccurrenceDue: due, now: () => t0, ...noTimer() });
    runtime.registerRoutine({
      identityId: 'i-1',
      routineId: 'r-1',
      trigger: createElapsedTrigger({ durationMs: 60_000 }),
      gates: {
        routineEnabled: true,
        temporaryOverride: createSnoozeOverride({
          now: t0 + 30_000,
          durationMs: 90_000,
          reason: 'meeting',
        }),
      },
      durableAnchorAt: t0,
      durableAnchorRevision: 'definition-1',
    });

    runtime.advance(asInstant(t0 + 60_000));
    expect(due).not.toHaveBeenCalled();
    runtime.advance(asInstant(t0 + 120_000));
    expect(due).toHaveBeenCalledTimes(1);
    expect(due).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceKey: 'routine:r-1:elapsed:definition-1:1',
        dueAt: t0 + 60_000,
      }),
    );
  });

  it('uses cold-start generation and ignores stale runtime snapshots from a prior definition revision', () => {
    const due = vi.fn();
    const runtime = createElapsedRuntime({
      onOccurrenceDue: due,
      now: () => t0 + 100_000,
      ...noTimer(),
    });
    runtime.registerRoutine({
      identityId: 'i-1',
      routineId: 'r-1',
      trigger: createElapsedTrigger({ durationMs: 60_000 }),
      gates: { routineEnabled: true },
      durableAnchorAt: t0 + 100_000,
      durableAnchorRevision: 'definition-2',
      initialGeneration: 4,
      restoredSnapshot: {
        identityId: 'i-1',
        routineId: 'r-1',
        anchorAt: asInstant(t0),
        anchorRevision: 'definition-1',
        generation: 2,
        thresholdSignaled: true,
        lastSatisfiedAt: null,
      },
    });

    expect(runtime.getSnapshot('i-1', 'r-1')).toMatchObject({
      anchorAt: t0 + 100_000,
      anchorRevision: 'definition-2',
      generation: 4,
      thresholdSignaled: false,
    });
  });
});
