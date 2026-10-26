import type { IdentityId } from '@memoflow/shared-primitives';
import type { TaskOccurrenceId } from '../../value-objects/task-occurrence-id';
import type { TaskPlanId } from '../../value-objects/task-plan-id';
import type {
  TaskGoalMeasurement,
  TaskGoalBindingDTO,
} from '../../value-objects/task-goal-binding';

/**
 * Authoritative occurrence completion fact.
 *
 * The event carries the Task-owned Goal link snapshot needed for
 * `EachCompletion`, including optional user measurement intent.
 * Whole-plan (`PlanCompletion`) eligibility is deliberately
 * absent: SETTLE-3501 drives it only from `task:plan-outcome-changed`.
 */
export interface TaskOccurrenceCompletedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  completedAt: number;
  taskTitle: string;
  goalBinding: TaskGoalBindingDTO | null;
  goalMeasurement?: TaskGoalMeasurement;
}
