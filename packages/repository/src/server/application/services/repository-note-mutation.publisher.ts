import {
  REPOSITORY_NOTE_MUTATED_EVENT,
  type RepositoryEventMap,
  type RepositoryNoteMutatedEvent,
} from '@memoflow/contracts/repository';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';

type RepositoryNoteMutationEvents = Pick<RepositoryEventMap, typeof REPOSITORY_NOTE_MUTATED_EVENT>;

const repositoryEventPublisher = createTypedEventPublisher<RepositoryNoteMutationEvents>(eventBus);

export type RepositoryNoteMutationPayload = Omit<RepositoryNoteMutatedEvent, 'timestamp'>;

export function publishRepositoryNoteMutation(payload: RepositoryNoteMutationPayload): void {
  repositoryEventPublisher.send(REPOSITORY_NOTE_MUTATED_EVENT, {
    ...payload,
    timestamp: Date.now(),
  });
}
