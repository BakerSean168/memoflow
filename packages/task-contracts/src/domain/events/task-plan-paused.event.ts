import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskPlanPausedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  pausedAt: number;
  taskPlan: TaskPlanServerDTO;
}
