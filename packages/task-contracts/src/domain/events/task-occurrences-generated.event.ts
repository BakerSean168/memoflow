import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskOccurrencesGeneratedEvent {
  identityId: IdentityId;
  planId: TaskPlanId;
  planTitle: string;
  occurrenceCount: number;
  strategy: 'full' | 'summary';
}
