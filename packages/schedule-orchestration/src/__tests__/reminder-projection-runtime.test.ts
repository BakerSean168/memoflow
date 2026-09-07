import { describe, expect, it, vi } from 'vitest';
import type {
  SchedulingOwner,
  SchedulingPort,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import type {
  ReminderScheduleProjectionEventMap,
  ReminderScheduleProjectionSource,
} from '@memoflow/reminder/schedule-projection';
import type { Subscriber } from '@memoflow/utils/domain';
import { createReminderProjectionRuntime } from '../runtime/reminder-projection-runtime';

function receipt(owner: SchedulingOwner): SchedulingReconcileReceipt {
  return {
    operationId: 'op',
    owner,
    status: 'succeeded',
    desiredCount: 0,
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    unchangedCount: 0,
    startedAt: 1,
    finishedAt: 2,
  };
}

function createReminderEventsHarness(): {
  subscriber: Subscriber<ReminderScheduleProjectionEventMap>;
  emit<K extends keyof ReminderScheduleProjectionEventMap>(
    event: K,
    payload: ReminderScheduleProjectionEventMap[K],
  ): Promise<void>;
} {
  const handlers = new Map<
    keyof ReminderScheduleProjectionEventMap,
    Set<(payload: never) => void>
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
      await Promise.all(
        Array.from(handlers.get(event) ?? []).map((handler) =>
          Promise.resolve(handler(payload as never)),
        ),
      );
    },
  };
}

describe('reminder projection runtime', () => {
  it('reconciles on persisted trigger, removes deleted owners, and unsubscribes on stop', async () => {
    const owner = {
      identityId: 'IdentityId_reminder-owner',
      type: 'reminder.template',
      id: 'ReminderTemplateId_r1',
    };
    const source: ReminderScheduleProjectionSource = {
      buildTemplatePlan: vi.fn().mockResolvedValue({ owner, desired: [] }),
      buildTemplateOwner: vi.fn().mockReturnValue(owner),
      listTemplateRefs: vi.fn().mockResolvedValue([]),
    };
    const reconcile = vi.fn().mockResolvedValue(receipt(owner));
    const removeOwner = vi.fn().mockResolvedValue(receipt(owner));
    const schedulingPort: SchedulingPort = { reconcile, removeOwner };
    const events = createReminderEventsHarness();
    const runtime = createReminderProjectionRuntime({
      source,
      schedulingPort,
      reminderEvents: events.subscriber,
    });

    await runtime.start();
    await events.emit('reminder:template-eligibility-changed', {
      identityId: owner.identityId as never,
      templateId: owner.id as never,
      cause: 'profile-membership-state',
    });
    await events.emit('reminder:triggered', {
      identityId: owner.identityId as never,
      templateId: owner.id as never,
      triggeredAt: 1,
      nextTriggerAt: 2,
      reminder: {} as never,
    });
    await events.emit('reminder:template-deleted', {
      identityId: owner.identityId as never,
      templateId: owner.id as never,
      templateTitle: 'Deleted reminder',
      reminder: {} as never,
      isSoftDelete: true,
      deletedAt: Date.now(),
    });
    await runtime.stop();
    await events.emit('reminder:triggered', {
      identityId: owner.identityId as never,
      templateId: owner.id as never,
      triggeredAt: 3,
      nextTriggerAt: 4,
      reminder: {} as never,
    });

    expect(source.buildTemplatePlan).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(source.buildTemplateOwner).toHaveBeenCalledTimes(1);
    expect(removeOwner).toHaveBeenCalledTimes(1);
  });
});
