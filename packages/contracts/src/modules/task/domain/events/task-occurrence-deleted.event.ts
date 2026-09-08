import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '../../../../primitives';

export interface TaskOccurrenceDeletedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  deletedAt: number;
}
