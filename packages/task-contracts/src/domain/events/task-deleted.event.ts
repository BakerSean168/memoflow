import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskDeletedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  isSoftDelete: boolean;
  deletedAt: number;
  task: TaskPlanServerDTO;
}
