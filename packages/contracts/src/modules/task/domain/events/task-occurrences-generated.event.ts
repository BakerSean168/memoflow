import type { IdentityId, TaskPlanId } from '../../../../primitives';

export interface TaskOccurrencesGeneratedEvent {
  identityId: IdentityId;
  planId: TaskPlanId;
  planTitle: string;
  occurrenceCount: number;
  strategy: 'full' | 'summary';
}
