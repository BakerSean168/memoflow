import type { RepositoryNoteMutatedEvent } from '../domain/events';

/**
 * Repository Module - Event Map
 *
 * Only the knowledge note mutation event remains on the shared bus.
 * Legacy repository aggregate lifecycle events were removed with database CRUD.
 */
export type RepositoryEventMap = {
  'repository:note:mutated': RepositoryNoteMutatedEvent;
};
