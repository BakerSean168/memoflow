import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '@memoflow/shared-primitives';

export interface TaskOccurrenceDeletedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  deletedAt: number;
}
