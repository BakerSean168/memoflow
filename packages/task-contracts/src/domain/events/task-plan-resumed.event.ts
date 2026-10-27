import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskPlanResumedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  resumedAt: number;
  taskPlan: TaskPlanServerDTO;
}
