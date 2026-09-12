import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '../../../../primitives';

/** Task occurrence time changed by its owning Task command. */
export interface TaskRescheduledEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  previousDueDate: number;
  newDueDate: number;
}
