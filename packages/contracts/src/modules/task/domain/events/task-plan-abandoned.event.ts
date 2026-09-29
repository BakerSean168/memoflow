import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId } from '../../../../primitives';

export interface TaskPlanAbandonedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  abandonedAt: number;
  reason: string | null;
  taskPlan: TaskPlanServerDTO;
}
