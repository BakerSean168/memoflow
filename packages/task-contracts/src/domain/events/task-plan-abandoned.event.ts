import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';

export interface TaskPlanAbandonedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  abandonedAt: number;
  reason: string | null;
  taskPlan: TaskPlanServerDTO;
}
