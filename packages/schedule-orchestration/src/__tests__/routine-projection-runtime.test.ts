import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import type {
  RoutineScheduleProjectionEventMap,
  RoutineScheduleProjectionSource,
} from '@memoflow/reminder/schedule-projection/routine';
import type { RoutineWallClockOccurrencePayload } from '@memoflow/reminder/schedule-execution/routine';
import type { Subscriber } from '@memoflow/utils/domain';
import { createRoutineProjectionRuntime } from '../runtime/routine-projection-runtime';

function owner(id = 'RoutineId_fixture-f'): SchedulingOwner {
  return { identityId: 'IdentityId_fixture-f', type: 'routine.routine', id };
}

function routinePayload(key = 'intent-1'): RoutineWallClockOccurrencePayload {
  return {
    routineId: 'RoutineId_fixture-f',
    identityId: 'IdentityId_fixture-f',
    occurrenceKey: key,
    scheduledFor: Date.parse('2026-08-25T15:30:00.000Z'),
    sourceRevision: 3,
  };
}

function intent(key = 'intent-1'): ScheduledIntent<RoutineWallClockOccurrencePayload> {
  return {
    schedulingKey: key,
    handlerKey: 'routine.wallclock.fire',
    runAt: Date.parse('2026-08-25T15:30:00.000Z'),
    payloadVersion: 1,
    payload: routinePayload(key),
    sourceRevision: 3,
  };
}

function receipt(target: SchedulingOwner, desiredCount: number): SchedulingReconcileReceipt {
  return {
    operationId: `op:${target.id}`,
    owner: target,
    status: 'succeeded',
    desiredCount,
    createdCount: desiredCount,
    updatedCount: 0,
    deletedCount: 0,
    unchangedCount: 0,
    startedAt: 1,
    finishedAt: 2,
  };
}

function createSchedulingPortHarness(): {
  port: SchedulingPort;
  reconciles: Array<{ owner: SchedulingOwner; desired: readonly ScheduledIntent[] }>;
  removals: SchedulingOwner[];
} {
  const reconciles: Array<{ owner: SchedulingOwner; desired: readonly ScheduledIntent[] }> = [];
  const removals: SchedulingOwner[] = [];
  return {
    port: {
      async reconcile(target, desired) {
        reconciles.push({ owner: target, desired });
        return receipt(target, desired.length);
      },
      async removeOwner(target) {
        removals.push(target);
        return receipt(target, 0);
      },
    },
    reconciles,
    removals,
  };
}

type RoutineProjectionEventName = keyof RoutineScheduleProjectionEventMap;

function createRoutineEventsHarness(): {
  subscriber: Subscriber<RoutineScheduleProjectionEventMap>;
  emit<K extends RoutineProjectionEventName>(
    event: K,
    payload: RoutineScheduleProjectionEventMap[K],
  ): Promise<void>;
} {
  const handlers = new Map<
    RoutineProjectionEventName,
    Set<(payload: unknown) => void | Promise<void>>
  >();

  return {
    subscriber: {
      on(event, handler) {
        const existing = handlers.get(event) ?? new Set();
        existing.add(handler as (payload: unknown) => void | Promise<void>);
        handlers.set(event, existing);
      },
      off(event, handler) {
        const existing = handlers.get(event);
        if (!existing) return;
        existing.delete(handler as (payload: unknown) => void | Promise<void>);
      },
    },
    async emit(event, payload) {
      const activeHandlers = Array.from(handlers.get(event) ?? []);
      await Promise.all(activeHandlers.map((handler) => handler(payload)));
    },
  };
}

function sourceWithPlan(
  overrides: Partial<RoutineScheduleProjectionSource> = {},
): RoutineScheduleProjectionSource {
  return {
    buildRoutinePlan: vi.fn(async (routineId, identityId) => ({
      owner: { identityId, type: 'routine.routine', id: routineId },
      desired: [intent()],
    })),
    buildRoutineOwner: vi.fn((routineId, identityId) => ({
      identityId,
      type: 'routine.routine',
      id: routineId,
    })),
    listRoutineRefs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('routine projection runtime -> SchedulingPort (ROUTINE-3401)', () => {
  it('reconciles the next durable occurrence when an occurrence is committed', async () => {
    const routineEvents = createRoutineEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createRoutineProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      routineEvents: routineEvents.subscriber,
    });

    await runtime.start();
    await routineEvents.emit('routine:occurrence-committed', {
      routineId: 'RoutineId_fixture-f',
      identityId: 'IdentityId_fixture-f',
      occurrenceKey: 'routine:RoutineId_fixture-f:oc:1787671800000',
      scheduledFor: Date.parse('2026-08-25T15:30:00.000Z'),
    });

    expect(source.buildRoutinePlan).toHaveBeenCalledWith(
      'RoutineId_fixture-f',
      'IdentityId_fixture-f',
    );
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
    await runtime.stop();
  });

  it('reconciles the desired set immediately when a snooze/override changes', async () => {
    const routineEvents = createRoutineEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createRoutineProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      routineEvents: routineEvents.subscriber,
    });

    await runtime.start();
    expect(scheduling.reconciles).toEqual([]);

    // Suppress / expiry of a snooze moves the desired set in place; the runtime
    // must rebuild it without waiting for the next occurrence commit.
    await routineEvents.emit('routine:override-changed', {
      routineId: 'RoutineId_fixture-f',
      identityId: 'IdentityId_fixture-f',
    });

    expect(source.buildRoutinePlan).toHaveBeenCalledWith(
      'RoutineId_fixture-f',
      'IdentityId_fixture-f',
    );
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
    await runtime.stop();
  });

  it('reconciles immediately when canonical Routine schedule truth changes', async () => {
    const routineEvents = createRoutineEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createRoutineProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      routineEvents: routineEvents.subscriber,
    });

    await runtime.start();
    await routineEvents.emit('routine:schedule-changed', {
      routineId: 'RoutineId_fixture-f',
      identityId: 'IdentityId_fixture-f',
    });

    expect(source.buildRoutinePlan).toHaveBeenCalledWith(
      'RoutineId_fixture-f',
      'IdentityId_fixture-f',
    );
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
    await runtime.stop();
  });

  it('registers only the incremental fast path; durable scans are centralized', async () => {
    const routineEvents = createRoutineEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan({
      listRoutineRefs: vi
        .fn()
        .mockResolvedValue([{ routineId: 'routine-1', identityId: 'identity-1' }]),
    });
    const runtime = createRoutineProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      routineEvents: routineEvents.subscriber,
    });

    await runtime.start();

    expect(source.listRoutineRefs).not.toHaveBeenCalled();
    expect(scheduling.reconciles).toEqual([]);
    await runtime.stop();
  });
});
