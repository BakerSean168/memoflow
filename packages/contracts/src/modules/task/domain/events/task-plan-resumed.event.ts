import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId } from '../../../../primitives';

export interface TaskPlanResumedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  resumedAt: number;
  taskPlan: TaskPlanServerDTO;
}
