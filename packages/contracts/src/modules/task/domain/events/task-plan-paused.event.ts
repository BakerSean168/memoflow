import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId } from '@memoflow/shared-primitives';

export interface TaskPlanPausedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  pausedAt: number;
  taskPlan: TaskPlanServerDTO;
}
