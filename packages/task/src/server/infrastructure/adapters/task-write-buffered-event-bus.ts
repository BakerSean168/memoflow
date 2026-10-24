import type { IDomainEvent } from '@memoflow/contracts/shared';
import { createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('TaskWriteBufferedEventBus');

export const committedTaskWriteEventBus = createEventBusAdapter(eventBus);

export class BufferedTaskWriteEventBus implements IEventBus {
  private readonly events: IDomainEvent[] = [];

  async publish<T extends IDomainEvent>(event: T): Promise<void> {
    this.events.push(event);
  }

  async flush(target: IEventBus): Promise<void> {
    await this.flushEvents(target, this.drain());
  }

  drain(): IDomainEvent[] {
    const events = [...this.events];
    this.events.length = 0;
    return events;
  }

  async flushEvents(target: IEventBus, events: IDomainEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await target.publish(event);
      } catch (error) {
        logger.error('Failed to publish buffered domain event', {
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          error,
        });
      }
    }
  }
}
