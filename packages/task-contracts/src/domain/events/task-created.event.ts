import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskPlanId } from '../../value-objects/task-plan-id';
import type { GoalId } from '@memoflow/goal-contracts';

export interface TaskCreatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  planId: TaskPlanId;
  goalId: GoalId | null;
}
