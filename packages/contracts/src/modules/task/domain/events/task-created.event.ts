import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId, GoalId } from '@memoflow/shared-primitives';

export interface TaskCreatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  planId: TaskPlanId;
  goalId: GoalId | null;
}
