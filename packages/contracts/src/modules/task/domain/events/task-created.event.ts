import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId, TaskPlanId, GoalId } from '../../../../primitives';

export interface TaskCreatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  templateId: TaskPlanId;
  goalId: GoalId | null;
}
