import type { IdentityId } from '@memoflow/shared-primitives';
import type { RepositoryId, ResourceId } from '../../ids';

/**
 * Fired when knowledge runtime creates/updates/deletes a note projection or
 * confirmed write. AI auto-index and other subscribers listen for this only.
 */
export const REPOSITORY_NOTE_MUTATED_EVENT = 'repository:note:mutated' as const;

export const RepositoryNoteMutationType = {
  Created: 'created',
  ContentUpdated: 'content_updated',
  Moved: 'moved',
  Deleted: 'deleted',
} as const;

export type RepositoryNoteMutationType =
  (typeof RepositoryNoteMutationType)[keyof typeof RepositoryNoteMutationType];

export interface RepositoryNoteMutatedEvent {
  identityId: IdentityId;
  repositoryId: RepositoryId;
  resourceId: ResourceId;
  resourcePath: string;
  mutation: RepositoryNoteMutationType;
  timestamp: number;
}
