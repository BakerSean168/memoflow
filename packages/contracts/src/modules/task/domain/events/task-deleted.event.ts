import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId } from '@memoflow/shared-primitives';

export interface TaskDeletedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  isSoftDelete: boolean;
  deletedAt: number;
  task: TaskPlanServerDTO;
}
