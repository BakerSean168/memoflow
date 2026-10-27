import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskOccurrenceId } from '../../value-objects/task-occurrence-id';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

/** Task occurrence time changed by its owning Task command. */
export interface TaskRescheduledEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  previousDueDate: number;
  newDueDate: number;
}
