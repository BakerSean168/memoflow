import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import type {
  TaskScheduleProjectionEventMap,
  TaskScheduleProjectionSource,
  TaskReminderScheduledPayload,
} from '@memoflow/task/schedule-projection';
import type { Subscriber } from '@memoflow/utils/domain';
import { createTaskProjectionRuntime } from '../runtime/task-projection-runtime';

function owner(id = 'TaskPlanId_template'): SchedulingOwner {
  return { identityId: 'IdentityId_schedule-owner', type: 'task.template', id };
}

function intent(key = 'intent-1'): ScheduledIntent<TaskReminderScheduledPayload> {
  return {
    schedulingKey: key,
    handlerKey: 'task.reminder.fire',
    runAt: Date.UTC(2030, 0, 10, 13, 30),
    payloadVersion: 1,
    payload: {
      templateId: 'TaskPlanId_template',
      instanceId: 'TaskOccurrenceId_instance',
      occurrenceKey: 'TaskPlanId_template:2030-01-10',
      taskTitle: 'Task',
      reminderType: 'Relative',
      reminderValue: 30,
      reminderUnit: 'Minutes',
      reminderAbsoluteTime: null,
      anchorTime: Date.UTC(2030, 0, 10, 14),
      reminderTime: Date.UTC(2030, 0, 10, 13, 30),
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

function createTaskEventsHarness(): {
  subscriber: Subscriber<TaskScheduleProjectionEventMap>;
  emit<K extends keyof TaskScheduleProjectionEventMap>(
    event: K,
    payload: TaskScheduleProjectionEventMap[K],
  ): Promise<void>;
} {
  const handlers = new Map<
    keyof TaskScheduleProjectionEventMap,
    Set<
      (
        payload: TaskScheduleProjectionEventMap[keyof TaskScheduleProjectionEventMap],
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
  overrides: Partial<TaskScheduleProjectionSource> = {},
): TaskScheduleProjectionSource {
  return {
    buildTemplatePlan: vi.fn(async (templateId, identityId) => ({
      owner: { identityId, type: 'task.template', id: templateId },
      desired: [intent()],
    })),
    buildTemplateOwner: vi.fn((templateId, identityId) => ({
      identityId,
      type: 'task.template',
      id: templateId,
    })),
    listTemplateRefs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('task projection runtime -> SchedulingPort', () => {
  it('reconciles the complete TaskPlan desired set on task:created', async () => {
    const taskEvents = createTaskEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createTaskProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      taskEvents: taskEvents.subscriber,
    });

    await runtime.start();
    await taskEvents.emit('task:created', {
      identityId: 'IdentityId_schedule-owner',
      templateId: 'TaskPlanId_template',
      goalId: null,
      task: { id: 'TaskPlanId_template' },
    } as never);

    expect(source.buildTemplatePlan).toHaveBeenCalledWith(
      'TaskPlanId_template',
      'IdentityId_schedule-owner',
    );
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
  });

  it('reconciles the owner after occurrence completion/skip/delete/uncomplete', async () => {
    const taskEvents = createTaskEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createTaskProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      taskEvents: taskEvents.subscriber,
    });
    await runtime.start();

    const common = {
      identityId: 'IdentityId_schedule-owner',
      taskOccurrenceId: 'TaskOccurrenceId_instance',
      taskPlanId: 'TaskPlanId_template',
    };
    await taskEvents.emit('task:instance-completed', {
      ...common,
      completedAt: Date.now(),
      taskTitle: 'Task',
      goalBinding: null,
    } as never);
    await taskEvents.emit('task:instance-skipped', {
      ...common,
      skippedAt: Date.now(),
      reason: 'waived',
    } as never);
    await taskEvents.emit('task:instance-deleted', {
      ...common,
      deletedAt: Date.now(),
    } as never);
    await taskEvents.emit('task:instance-uncompleted', {
      ...common,
      uncompletedAt: Date.now(),
    } as never);

    expect(source.buildTemplatePlan).toHaveBeenCalledTimes(4);
    expect(scheduling.reconciles).toHaveLength(4);
    expect(scheduling.removals).toHaveLength(0);
  });

  it('reconciles the owner on task:rescheduled (incremental fast path)', async () => {
    const taskEvents = createTaskEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createTaskProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      taskEvents: taskEvents.subscriber,
    });
    await runtime.start();

    await taskEvents.emit('task:rescheduled', {
      identityId: 'IdentityId_schedule-owner',
      taskOccurrenceId: 'TaskOccurrenceId_instance',
      taskPlanId: 'TaskPlanId_template',
      previousDueDate: Date.now(),
      newDueDate: Date.now(),
    } as never);

    expect(source.buildTemplatePlan).toHaveBeenCalledWith(
      'TaskPlanId_template',
      'IdentityId_schedule-owner',
    );
    expect(scheduling.reconciles).toEqual([{ owner: owner(), desired: [intent()] }]);
    expect(scheduling.removals).toEqual([]);

    await runtime.stop();
    await taskEvents.emit('task:rescheduled', {
      identityId: 'IdentityId_schedule-owner',
      taskOccurrenceId: 'TaskOccurrenceId_instance',
      taskPlanId: 'TaskPlanId_template',
      previousDueDate: Date.now(),
      newDueDate: Date.now(),
    } as never);
    expect(source.buildTemplatePlan).toHaveBeenCalledTimes(1);
  });

  it('removes the whole TaskPlan owner on pause/delete and unsubscribes on stop', async () => {
    const taskEvents = createTaskEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan();
    const runtime = createTaskProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      taskEvents: taskEvents.subscriber,
    });
    await runtime.start();

    await taskEvents.emit('task:template-paused', {
      identityId: 'IdentityId_schedule-owner',
      taskPlanId: 'TaskPlanId_template',
      pausedAt: Date.now(),
      taskPlan: { id: 'TaskPlanId_template' },
    } as never);
    await taskEvents.emit('task:deleted', {
      identityId: 'IdentityId_schedule-owner',
      taskPlanId: 'TaskPlanId_template',
      deletedAt: Date.now(),
    } as never);
    await runtime.stop();
    await taskEvents.emit('task:deleted', {
      identityId: 'IdentityId_schedule-owner',
      taskPlanId: 'TaskPlanId_template',
      deletedAt: Date.now(),
    } as never);

    expect(scheduling.removals).toEqual([owner(), owner()]);
  });

  it('registers only the incremental fast path; durable scans are centralized', async () => {
    const taskEvents = createTaskEventsHarness();
    const scheduling = createSchedulingPortHarness();
    const source = sourceWithPlan({
      listTemplateRefs: vi
        .fn()
        .mockResolvedValue([{ templateId: 'tpl-1', identityId: 'identity-1' }]),
    });
    const runtime = createTaskProjectionRuntime({
      source,
      schedulingPort: scheduling.port,
      taskEvents: taskEvents.subscriber,
    });

    await runtime.start();

    expect(source.listTemplateRefs).not.toHaveBeenCalled();
    expect(scheduling.reconciles).toEqual([]);
    await runtime.stop();
  });
});
