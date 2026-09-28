import { describe, expect, it } from 'vitest';
import { createElapsedTrigger } from './trigger';
import { computeDurableElapsedNextOccurrence } from './durable-elapsed';

describe('computeDurableElapsedNextOccurrence', () => {
  const activatedAt = Date.parse('2026-09-28T00:00:00.000Z');

  it('uses activation as the cold-start anchor for last-satisfied', () => {
    const trigger = createElapsedTrigger({
      durationMs: 50 * 60_000,
      anchor: 'last-satisfied',
    });
    if (trigger.timingOwner !== 'scheduler') throw new Error('expected scheduler trigger');

    expect(
      computeDurableElapsedNextOccurrence({
        routineId: 'move',
        trigger,
        activatedAt,
        occurrences: [],
      }),
    ).toMatchObject({
      occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':1',
      dueAt: activatedAt + 50 * 60_000,
      runAt: activatedAt + 50 * 60_000,
      generation: 1,
    });
  });

  it('resets last-satisfied to the completion time and starts generation 1 again', () => {
    const trigger = createElapsedTrigger({
      durationMs: 50 * 60_000,
      anchor: 'last-satisfied',
    });
    if (trigger.timingOwner !== 'scheduler') throw new Error('expected scheduler trigger');
    const resolvedAt = activatedAt + 55 * 60_000;

    const next = computeDurableElapsedNextOccurrence({
      routineId: 'move',
      trigger,
      activatedAt,
      occurrences: [
        {
          occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':1',
          sourceRevision: '1',
          resolutionState: 'Satisfied',
          resolvedAt,
        },
      ],
    });

    expect(next).toMatchObject({
      occurrenceKey: 'routine:move:elapsed:satisfied-' + resolvedAt + ':1',
      dueAt: resolvedAt + 50 * 60_000,
      generation: 1,
    });
  });

  it('does not arm another generation while the current occurrence remains open', () => {
    const trigger = createElapsedTrigger({
      durationMs: 50 * 60_000,
      anchor: 'routine-activation',
    });
    if (trigger.timingOwner !== 'scheduler') throw new Error('expected scheduler trigger');

    expect(
      computeDurableElapsedNextOccurrence({
        routineId: 'move',
        trigger,
        activatedAt,
        occurrences: [
          {
            occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':1',
            sourceRevision: '1',
            resolutionState: 'Open',
            resolvedAt: null,
          },
        ],
      }),
    ).toBeNull();
  });

  it('skips already-past routine-activation boundaries after a late resolution', () => {
    const trigger = createElapsedTrigger({
      durationMs: 50 * 60_000,
      anchor: 'routine-activation',
    });
    if (trigger.timingOwner !== 'scheduler') throw new Error('expected scheduler trigger');
    const resolvedAt = activatedAt + 125 * 60_000;

    expect(
      computeDurableElapsedNextOccurrence({
        routineId: 'move',
        trigger,
        activatedAt,
        occurrences: [
          {
            occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':1',
            sourceRevision: '1',
            resolutionState: 'Skipped',
            resolvedAt,
          },
        ],
      }),
    ).toMatchObject({
      occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':3',
      dueAt: activatedAt + 150 * 60_000,
      generation: 3,
    });
  });

  it('does not reuse satisfaction from before the current activation boundary', () => {
    const trigger = createElapsedTrigger({
      durationMs: 50 * 60_000,
      anchor: 'last-satisfied',
    });
    if (trigger.timingOwner !== 'scheduler') throw new Error('expected scheduler trigger');

    expect(
      computeDurableElapsedNextOccurrence({
        routineId: 'move',
        trigger,
        activatedAt,
        occurrences: [
          {
            occurrenceKey: 'old',
            sourceRevision: '1',
            resolutionState: 'Satisfied',
            resolvedAt: activatedAt - 10_000,
          },
        ],
      }),
    ).toMatchObject({
      occurrenceKey: 'routine:move:elapsed:activation-' + activatedAt + ':1',
    });
  });
});
