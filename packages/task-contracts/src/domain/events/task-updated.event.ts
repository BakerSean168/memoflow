import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface TaskUpdatedEvent {
  identityId: IdentityId;
  task: TaskPlanServerDTO;
  changes: string[];
}
