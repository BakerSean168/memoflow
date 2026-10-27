import type { IDomainEvent } from '@memoflow/shared-primitives';
import { createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('GoalWriteEventBuffer');

export const committedGoalWriteEventBus = createEventBusAdapter(eventBus);

export class BufferedGoalWriteEventBus implements IEventBus {
  private readonly events: IDomainEvent[] = [];

  async publish<T extends IDomainEvent>(event: T): Promise<void> {
    this.events.push(event);
  }

  async flush(target: IEventBus): Promise<void> {
    for (const event of this.events) {
      try {
        await target.publish(event);
      } catch (error) {
        logger.error('Post-commit goal event delivery failed', {
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.events.length = 0;
  }
}
