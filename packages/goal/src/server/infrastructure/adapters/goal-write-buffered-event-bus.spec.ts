import { describe, expect, it, vi } from 'vitest';
import type { IDomainEvent } from '@memoflow/shared-primitives';
import type { IEventBus } from '@memoflow/patterns';
import { BufferedGoalWriteEventBus } from './goal-write-buffered-event-bus';

const event: IDomainEvent = {
  eventType: 'goal:test',
  payload: {},
  aggregateId: 'goal-1',
  occurredAt: new Date(0),
};

describe('BufferedGoalWriteEventBus', () => {
  it('never turns a committed write into a command failure when post-commit delivery fails', async () => {
    const bus = new BufferedGoalWriteEventBus();
    const target = {
      publish: vi.fn().mockRejectedValue(new Error('subscriber unavailable')),
    } as IEventBus;
    await bus.publish(event);

    await expect(bus.flush(target)).resolves.toBeUndefined();
  });
});
