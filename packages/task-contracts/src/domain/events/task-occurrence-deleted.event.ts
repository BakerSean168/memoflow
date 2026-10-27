import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskOccurrenceId } from '../../value-objects/task-occurrence-id';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskOccurrenceDeletedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  deletedAt: number;
}
