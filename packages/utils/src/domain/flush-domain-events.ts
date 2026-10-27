import type { IDomainEvent } from '@memoflow/shared-primitives';
import type { Publisher } from './typed-event-port';

type TypedEventMap = Record<string, unknown>;

type DomainEventSource = {
  pullDomainEvents(): IDomainEvent[];
};

export function publishDomainEvents<TEvents extends TypedEventMap>(
  publisher: Publisher<TEvents>,
  events: ReadonlyArray<IDomainEvent>,
): void {
  for (const event of events) {
    const eventType = event.eventType as keyof TEvents;
    publisher.send(eventType, event.payload as TEvents[typeof eventType]);
  }
}

export function flushDomainEvents<TEvents extends TypedEventMap>(
  publisher: Publisher<TEvents>,
  source: DomainEventSource,
): void {
  publishDomainEvents(publisher, source.pullDomainEvents());
}
