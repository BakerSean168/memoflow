import { describe, expect, it, vi } from 'vitest';
import { TaskGoalOutboxDispatcher } from './task-goal-outbox-dispatcher';

const pendingEvent = {
  eventId: 'event-1',
  payload: JSON.stringify({
    eventId: 'event-1',
    schemaVersion: 2 as const,
    eventType: 'task.goal-progress-requested' as const,
    identityId: 'identity-1',
    taskOccurrenceId: 'instance-1',
    taskPlanId: 'template-1',
    goalId: 'goal-1',
    keyResultId: 'kr-1',
    value: 1,
    source: { type: 'TaskOccurrence', id: 'instance-1' },
    taskTitle: 'Task',
    occurredAt: 1,
    action: 'apply' as const,
  }),
};

describe('TaskGoalOutboxDispatcher', () => {
  it('replays persisted V2 events after restart and marks delivered only after Goal succeeds', async () => {
    const store = {
      claimPending: vi.fn(async () => [pendingEvent]),
      markDelivered: vi.fn(),
      markRetry: vi.fn(),
      replayDeadLetter: vi.fn(),
    };
    const handler = { handle: vi.fn(async () => {}) };

    await new TaskGoalOutboxDispatcher(store, handler).dispatchPending();

    expect(handler.handle).toHaveBeenCalledWith(JSON.parse(pendingEvent.payload));
    expect(store.markDelivered).toHaveBeenCalledWith('event-1');
    expect(store.markRetry).not.toHaveBeenCalled();
  });

  it('retries malformed persisted payloads instead of blocking the poll cycle', async () => {
    const malformed = { eventId: 'broken-1', payload: '{not-json' };
    const store = {
      claimPending: vi.fn(async () => [malformed, pendingEvent]),
      markDelivered: vi.fn(),
      markRetry: vi.fn(),
      replayDeadLetter: vi.fn(),
    };
    const handler = { handle: vi.fn(async () => {}) };

    await new TaskGoalOutboxDispatcher(store, handler).dispatchPending();

    expect(store.markRetry).toHaveBeenCalledWith('broken-1', expect.any(String));
    expect(store.markDelivered).toHaveBeenCalledWith('event-1');
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  it('rejects V1 payloads so an obsolete contract cannot be silently replayed', async () => {
    const obsolete = {
      eventId: 'old-1',
      payload: JSON.stringify({ ...JSON.parse(pendingEvent.payload), eventId: 'old-1', schemaVersion: 1 }),
    };
    const store = {
      claimPending: vi.fn(async () => [obsolete]),
      markDelivered: vi.fn(),
      markRetry: vi.fn(),
      replayDeadLetter: vi.fn(),
    };

    await new TaskGoalOutboxDispatcher(store, { handle: vi.fn() }).dispatchPending();

    expect(store.markDelivered).not.toHaveBeenCalled();
    expect(store.markRetry).toHaveBeenCalledWith('old-1', 'Unsupported Task -> Goal event contract');
  });

  it('keeps the same eventId pending for retry when delivery fails', async () => {
    const store = {
      claimPending: vi.fn(async () => [pendingEvent]),
      markDelivered: vi.fn(),
      markRetry: vi.fn(),
      replayDeadLetter: vi.fn(),
    };
    const handler = { handle: vi.fn(async () => { throw new Error('Goal unavailable'); }) };

    await new TaskGoalOutboxDispatcher(store, handler).dispatchPending();

    expect(store.markDelivered).not.toHaveBeenCalled();
    expect(store.markRetry).toHaveBeenCalledWith('event-1', 'Goal unavailable');
  });
});
