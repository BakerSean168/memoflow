import { describe, expect, it, vi } from 'vitest';
import type { RoutineTemporaryOverride } from '@memoflow/reminder/schedule-execution/routine';
import type { RoutineOverrideChangedEvent } from '@memoflow/reminder/schedule-projection/routine';
import { createRoutineOverrideChangedPublishingStore } from '../infrastructure-server/routine-override-changing-store';

function override(): RoutineTemporaryOverride {
  return {
    snoozeUntil: Date.parse('2026-08-25T16:00:00.000Z'),
    suppressUntil: null,
    overrideIntervalMs: null,
    expiresAt: Date.parse('2026-08-25T16:00:00.000Z'),
    reason: 'snooze',
    source: 'user',
  };
}

function createHarness() {
  const written: Array<{ identityId: string; routineId: string; override?: RoutineTemporaryOverride }> = [];
  const cleared: Array<{ identityId: string; routineId: string }> = [];
  const published: RoutineOverrideChangedEvent[] = [];
  const store = {
    findRoutineTemporaryOverride: vi.fn<
      () => Promise<RoutineTemporaryOverride | null>
    >(async () => null),
    setRoutineTemporaryOverride: vi.fn(async (input) => {
      written.push(input);
    }),
    clearRoutineTemporaryOverride: vi.fn(async (input) => {
      cleared.push(input);
    }),
  };
  const publishing = createRoutineOverrideChangedPublishingStore({
    store,
    publish: (event) => {
      published.push(event);
    },
  });
  return { store, publishing, written, cleared, published };
}

describe('createRoutineOverrideChangedPublishingStore (ROUTINE-3401)', () => {
  it('passes through reads without publishing an override-changed event', async () => {
    const harness = createHarness();
    harness.store.findRoutineTemporaryOverride.mockResolvedValueOnce(override());

    await expect(
      harness.publishing.findRoutineTemporaryOverride({
        identityId: 'identity-1',
        routineId: 'routine-1',
      }),
    ).resolves.toEqual(override());

    expect(harness.store.findRoutineTemporaryOverride).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
    });
    expect(harness.published).toEqual([]);
  });

  it('persists a snooze then publishes override-changed with the same routine identity', async () => {
    const harness = createHarness();

    await harness.publishing.setRoutineTemporaryOverride({
      identityId: 'identity-1',
      routineId: 'routine-1',
      override: override(),
    });

    expect(harness.store.setRoutineTemporaryOverride).toHaveBeenCalledTimes(1);
    expect(harness.written).toEqual([
      { identityId: 'identity-1', routineId: 'routine-1', override: override() },
    ]);
    expect(harness.published).toEqual([
      { identityId: 'identity-1', routineId: 'routine-1' },
    ]);
  });

  it('publishes override-changed after clearing a suppress so the Scheduler re-arms', async () => {
    const harness = createHarness();

    await harness.publishing.clearRoutineTemporaryOverride({
      identityId: 'identity-1',
      routineId: 'routine-1',
    });

    expect(harness.cleared).toEqual([{ identityId: 'identity-1', routineId: 'routine-1' }]);
    expect(harness.published).toEqual([
      { identityId: 'identity-1', routineId: 'routine-1' },
    ]);
  });

  it('does not publish when the durable write fails', async () => {
    const harness = createHarness();
    harness.store.setRoutineTemporaryOverride.mockRejectedValueOnce(new Error('db down'));

    await expect(
      harness.publishing.setRoutineTemporaryOverride({
        identityId: 'identity-1',
        routineId: 'routine-1',
        override: override(),
      }),
    ).rejects.toThrow('db down');

    expect(harness.published).toEqual([]);
  });
});