import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '../../../../primitives';

export interface TaskUpdatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  changes: string[];
}
