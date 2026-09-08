import { describe, expect, it, vi } from 'vitest';
import type { SchedulingOwner, SchedulingReconcileReceipt } from '@memoflow/contracts/schedule';
import { createCompositeRuntimeContribution } from '../runtime/composite-runtime';
import {
  createProjectionRepairRuntime,
  defineProjectionRepairLane,
} from '../runtime/projection-repair-runtime';
import type { RuntimeContribution } from '../ports/runtime-contribution';

function owner(source: 'task' | 'goal' | 'reminder' | 'routine', id: string): SchedulingOwner {
  return {
    identityId: 'IdentityId_repair',
    type: `${source}.owner`,
    id,
  };
}

function receipt(
  target: SchedulingOwner,
  counts: { created?: number; updated?: number; deleted?: number; unchanged?: number } = {},
): SchedulingReconcileReceipt {
  return {
    operationId: `repair:${target.type}:${target.id}`,
    owner: target,
    status: 'succeeded',
    desiredCount: 1,
    createdCount: counts.created ?? 0,
    updatedCount: counts.updated ?? 0,
    deletedCount: counts.deleted ?? 0,
    unchangedCount: counts.unchanged ?? 0,
    startedAt: 1,
    finishedAt: 2,
  };
}

function listenerContribution(name: string, order: string[]): RuntimeContribution {
  let started = false;
  return {
    async start() {
      if (started) return;
      order.push(`listen:${name}`);
      started = true;
    },
    async stop() {
      started = false;
    },
  };
}

describe('common projection repair runtime (SCHED-3601)', () => {
  it('registers every incremental listener before full repair and heals lost Task/Goal/Routine events after restart', async () => {
    const order: string[] = [];
    const durableProjection = new Set<string>();
    const allListenersReady = () =>
      ['task', 'goal', 'reminder', 'routine'].every((source) => order.includes(`listen:${source}`));

    const lane = (source: 'task' | 'goal' | 'reminder' | 'routine', id: string) =>
      defineProjectionRepairLane({
        source,
        async enumerate() {
          expect(allListenersReady()).toBe(true);
          order.push(`enumerate:${source}`);
          return [{ id }];
        },
        describe: (ref) => ref.id,
        async repair(ref) {
          const key = `${source}:${ref.id}:stable-scheduling-key`;
          const target = owner(source, ref.id);
          if (durableProjection.has(key)) {
            return receipt(target, { unchanged: 1 });
          }
          durableProjection.add(key);
          return receipt(target, { created: 1 });
        },
      });

    const repairRuntime = createProjectionRepairRuntime([
      lane('task', 'task-1'),
      lane('goal', 'goal-1'),
      lane('reminder', 'reminder-1'),
      lane('routine', 'routine-1'),
    ]);
    const runtime = createCompositeRuntimeContribution([
      listenerContribution('task', order),
      listenerContribution('goal', order),
      listenerContribution('reminder', order),
      listenerContribution('routine', order),
      repairRuntime,
    ]);

    // Simulate a lost event: durable business state exists in enumerate(), but
    // no incremental listener was invoked and Scheduler projection is empty.
    expect(durableProjection.size).toBe(0);
    await runtime.start();

    expect([...durableProjection].sort()).toEqual([
      'goal:goal-1:stable-scheduling-key',
      'reminder:reminder-1:stable-scheduling-key',
      'routine:routine-1:stable-scheduling-key',
      'task:task-1:stable-scheduling-key',
    ]);
    expect(repairRuntime.metrics.snapshot()).toEqual({
      task: { repaired: 1, unchanged: 0, failed: 0 },
      goal: { repaired: 1, unchanged: 0, failed: 0 },
      reminder: { repaired: 1, unchanged: 0, failed: 0 },
      routine: { repaired: 1, unchanged: 0, failed: 0 },
      total: { repaired: 4, unchanged: 0, failed: 0 },
    });

    // A later restart re-enumerates the same stable keys and must converge as
    // unchanged rather than duplicating scheduled work.
    await runtime.stop();
    order.length = 0;
    await runtime.start();

    expect(durableProjection.size).toBe(4);
    expect(repairRuntime.metrics.snapshot()).toEqual({
      task: { repaired: 1, unchanged: 1, failed: 0 },
      goal: { repaired: 1, unchanged: 1, failed: 0 },
      reminder: { repaired: 1, unchanged: 1, failed: 0 },
      routine: { repaired: 1, unchanged: 1, failed: 0 },
      total: { repaired: 4, unchanged: 4, failed: 0 },
    });
  });

  it('isolates one owner repair failure, records failed, and continues the durable sweep', async () => {
    const repaired: string[] = [];
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        enumerate: vi.fn().mockResolvedValue([{ id: 'good-1' }, { id: 'bad' }, { id: 'good-2' }]),
        describe: (ref) => ref.id,
        async repair(ref) {
          if (ref.id === 'bad') throw new Error('fixture repair failure');
          repaired.push(ref.id);
          return receipt(owner('task', ref.id), { created: 1 });
        },
      }),
    ]);

    await expect(runtime.start()).resolves.toBeUndefined();

    expect(repaired).toEqual(['good-1', 'good-2']);
    expect(runtime.metrics.snapshot().task).toEqual({ repaired: 2, unchanged: 0, failed: 1 });
  });

  it('records enumeration failure without preventing another source lane from repairing', async () => {
    const goalRepair = vi.fn(async (ref: { id: string }) =>
      receipt(owner('goal', ref.id), { created: 1 }),
    );
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        enumerate: async () => {
          throw new Error('fixture enumeration failure');
        },
        describe: (ref) => ref.id,
        repair: async (ref) => receipt(owner('task', ref.id), { created: 1 }),
      }),
      defineProjectionRepairLane({
        source: 'goal',
        enumerate: async () => [{ id: 'goal-1' }],
        describe: (ref) => ref.id,
        repair: goalRepair,
      }),
    ]);

    await runtime.start();

    expect(goalRepair).toHaveBeenCalledTimes(1);
    expect(runtime.metrics.snapshot()).toMatchObject({
      task: { repaired: 0, unchanged: 0, failed: 1 },
      goal: { repaired: 1, unchanged: 0, failed: 0 },
      total: { repaired: 1, unchanged: 0, failed: 1 },
    });
  });

  it('heals an intentionally lost delete event by removing the stale Scheduler owner after restart', async () => {
    const removedOwners: string[] = [];
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        // The source row is physically gone (delete event was lost): no refs.
        enumerate: async () => [],
        describe: (ref) => ref.id,
        repair: async (ref) => receipt(owner('task', ref.id), { unchanged: 1 }),
        buildOwner: (ref) => owner('task', ref.id),
        // The lost delete event left the owner's persisted scheduling keys behind.
        listSchedulerOwners: async () => [owner('task', 'deleted-template')],
        removeOwner: async (target) => {
          removedOwners.push(target.id);
          return receipt(target, { deleted: 1 });
        },
        describeOwner: (target) => target.id,
      }),
    ]);

    await runtime.start();

    expect(removedOwners).toEqual(['deleted-template']);
    expect(runtime.metrics.snapshot().task).toEqual({ repaired: 1, unchanged: 0, failed: 0 });
  });

  it('keeps a Scheduler owner the source still enumerates and removes a stale same-source owner', async () => {
    const removedOwners: string[] = [];
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        enumerate: async () => [{ id: 'alive-1' }],
        describe: (ref) => ref.id,
        repair: async (ref) => receipt(owner('task', ref.id), { unchanged: 1 }),
        buildOwner: (ref) => owner('task', ref.id),
        // The lane reports ONLY its own source's owners (composition root
        // filters by owner type), so cross-source owners are never candidates.
        listSchedulerOwners: async () => [owner('task', 'alive-1'), owner('task', 'deleted-1')],
        removeOwner: async (target) => {
          removedOwners.push(target.id);
          return receipt(target, { deleted: 1 });
        },
        describeOwner: (target) => target.id,
      }),
    ]);

    await runtime.start();

    expect(removedOwners).toEqual(['deleted-1']);
    // alive-1 stays (unchanged from the repair pass); deleted-1 is healed.
    expect(runtime.metrics.snapshot().task).toEqual({ repaired: 1, unchanged: 1, failed: 0 });
  });

  it('distinguishes a stale-owner removal failure as failed while still sweeping remaining owners', async () => {
    const removedOwners: string[] = [];
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        enumerate: async () => [],
        describe: (ref) => ref.id,
        repair: async (ref) => receipt(owner('task', ref.id), { unchanged: 1 }),
        buildOwner: (ref) => owner('task', ref.id),
        listSchedulerOwners: async () => [owner('task', 'bad'), owner('task', 'good')],
        removeOwner: async (target) => {
          removedOwners.push(target.id);
          if (target.id === 'bad') throw new Error('fixture stale-owner removal failure');
          return receipt(target, { deleted: 1 });
        },
        describeOwner: (target) => target.id,
      }),
    ]);

    await runtime.start();

    expect(removedOwners).toEqual(['bad', 'good']);
    expect(runtime.metrics.snapshot().task).toEqual({ repaired: 1, unchanged: 0, failed: 1 });
  });

  it('reports stale-owner enumeration failure as failed without aborting the source sweep', async () => {
    const runtime = createProjectionRepairRuntime([
      defineProjectionRepairLane<{ id: string }>({
        source: 'task',
        enumerate: async () => [{ id: 'alive-1' }],
        describe: (ref) => ref.id,
        repair: async (ref) => receipt(owner('task', ref.id), { created: 1 }),
        buildOwner: (ref) => owner('task', ref.id),
        listSchedulerOwners: async () => {
          throw new Error('fixture owner enumeration failure');
        },
        removeOwner: async (target) => receipt(target, { deleted: 1 }),
        describeOwner: (target) => target.id,
      }),
    ]);

    await runtime.start();

    expect(runtime.metrics.snapshot().task).toEqual({ repaired: 1, unchanged: 0, failed: 1 });
  });
});
