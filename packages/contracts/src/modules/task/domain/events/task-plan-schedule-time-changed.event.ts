import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { TaskTimeConfigDTO } from '../../value-objects/task-time-config';
import type { IdentityId, Instant } from '../../../../primitives';

export interface TaskPlanScheduleTimeChangedEvent {
  identityId: IdentityId;
  taskPlan: TaskPlanServerDTO;
  oldStartDate: Instant | null;
  oldDueDate: Instant | null;
  newStartDate: Instant | null;
  newDueDate: Instant | null;
  oldTimeConfig?: TaskTimeConfigDTO | null;
  newTimeConfig?: TaskTimeConfigDTO | null;
}
