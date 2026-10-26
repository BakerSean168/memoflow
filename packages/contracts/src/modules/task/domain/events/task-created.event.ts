import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId } from '@memoflow/shared-primitives';
import type { GoalId } from '@memoflow/goal-contracts';

export interface TaskCreatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  planId: TaskPlanId;
  goalId: GoalId | null;
}
