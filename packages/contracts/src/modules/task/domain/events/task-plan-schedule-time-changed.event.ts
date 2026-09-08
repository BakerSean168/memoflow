import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { TaskTimeConfigDTO } from '../../value-objects/task-time-config';
import type { IdentityId } from '../../../../primitives';

export interface TaskPlanScheduleTimeChangedEvent {
  identityId: IdentityId;
  taskPlan: TaskPlanServerDTO;
  oldTimeConfig?: TaskTimeConfigDTO | null;
  newTimeConfig?: TaskTimeConfigDTO | null;
}
