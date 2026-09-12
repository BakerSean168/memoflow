import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import {
  GOAL_REMINDER_PAYLOAD_VERSION,
  type GoalReminderScheduledPayload,
  type GoalScheduleProjectionEventMap,
  type GoalScheduleProjectionSource,
} from '@memoflow/goal/schedule-projection';
import { requireYmd } from '@memoflow/contracts/primitives';
import type { Subscriber } from '@memoflow/utils/domain';
import { createGoalProjectionRuntime } from '../runtime/goal-projection-runtime';

function owner(id = 'GoalId_goal'): SchedulingOwner {
  return { identityId: 'IdentityId_schedule-owner', type: 'goal.goal', id };
}

function intent(key = 'intent-1'): ScheduledIntent<GoalReminderScheduledPayload> {
  return {
    schedulingKey: key,
    handlerKey: 'goal.reminder.fire',
    runAt: Date.UTC(2030, 0, 13, 0, 0),
    payloadVersion: GOAL_REMINDER_PAYLOAD_VERSION,
    payload: {
      goalId: 'GoalId_goal',
      goalTitle: 'Goal',
      triggerType: 'RemainingDays',
      triggerValue: 7,
      startDate: null,
      target: { kind: 'day', date: requireYmd('2030-01-20') },
      reminderTime: Date.UTC(2030, 0, 13, 0, 0),
    },
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

function createGoalEventsHarness(): {
  subscriber: Subscriber<GoalScheduleProjectionEventMap>;
  emit<K extends keyof GoalScheduleProjectionEventMap>(
    event: K,
    payload: GoalScheduleProjectionEventMap[K],
  ): Promise<void>;
} {
  const handlers = new Map<
    keyof GoalScheduleProjectionEventMap,
    Set<
      (
        payload: GoalScheduleProjectionEventMap[keyof GoalScheduleProjectionEventMap],
      ) => void | Promise<void>
    >
  >();

  return {
    subscriber: {
      on(event, handler) {
        const existing = handlers.get(event) ?? new Set();
        existing.add(handler as never);
        handlers.set(event, existing);
      },
      off(event, handler) {
        handlers.get(event)?.delete(handler as never);
      },
    },
    async emit(event, payload) {
      const activeHandlers = Array.from(handlers.get(event) ?? []);
      await Promise.all(activeHandlers.map((handler) => handler(payload)));
    },
  };
}

function sourceWithPlan(
  overrides: Partial<GoalScheduleProjectionSource> = {},
): GoalScheduleProjectionSource {
  return {
    buildGoalPlan: vi.fn(async (goalId, identityId) => ({
      owner: { identityId, type: 'goal.goal', id: goalId },
      desired: [intent()],
    })),
    buildGoalOwner: vi.fn((goalId, identityId) => ({
      identityId,
      type: 'goal.goal',
      id: goalId,
    })),
    listGoalRefs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('goal projection runtime -> SchedulingPort', () => {
  it('reconciles the complete Goal desired set on goal:created', async () => {
    const goalEvents = createGoalEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createGoalProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      goalEvents: goalEvents.subscriber,
    });

    await runtime.start();
    await goalEvents.emit('goal:created', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);

    expect(source.buildGoalPlan).toHaveBeenCalledWith('GoalId_goal', 'IdentityId_schedule-owner');
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
  });

  it('reconciles the owner after schedule-time/reminder-config changes', async () => {
    const goalEvents = createGoalEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createGoalProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      goalEvents: goalEvents.subscriber,
    });
    await runtime.start();

    await goalEvents.emit('goal:schedule-time-changed', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);
    await goalEvents.emit('goal:reminder-config-changed', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);

    expect(source.buildGoalPlan).toHaveBeenCalledTimes(2);
    expect(scheduling.reconciles).toHaveLength(2);
    expect(scheduling.removals).toHaveLength(0);
  });

  it('removes the whole Goal owner on completed/archived/deleted and unsubscribes on stop', async () => {
    const goalEvents = createGoalEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createGoalProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      goalEvents: goalEvents.subscriber,
    });
    await runtime.start();

    await goalEvents.emit('goal:completed', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);
    await goalEvents.emit('goal:archived', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);
    await goalEvents.emit('goal:deleted', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);
    await runtime.stop();
    await goalEvents.emit('goal:deleted', {
      identityId: 'IdentityId_schedule-owner',
      goal: { id: 'GoalId_goal' },
    } as never);

    expect(scheduling.removals).toEqual([owner(), owner(), owner()]);
  });

  it('registers only the incremental fast path; durable scans are centralized', async () => {
    const goalEvents = createGoalEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan({
      listGoalRefs: vi.fn().mockResolvedValue([{ goalId: 'goal-1', identityId: 'identity-1' }]),
    });
    const runtime = createGoalProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      goalEvents: goalEvents.subscriber,
    });

    await runtime.start();

    expect(source.listGoalRefs).not.toHaveBeenCalled();
    expect(scheduling.reconciles).toEqual([]);
    await runtime.stop();
  });
});
