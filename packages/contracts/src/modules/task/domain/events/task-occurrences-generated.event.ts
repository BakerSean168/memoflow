import type { IdentityId, TaskPlanId } from '@memoflow/shared-primitives';

export interface TaskOccurrencesGeneratedEvent {
  identityId: IdentityId;
  planId: TaskPlanId;
  planTitle: string;
  occurrenceCount: number;
  strategy: 'full' | 'summary';
}
