import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '../../../../primitives';
import type { TaskGoalBindingDTO } from '../../value-objects/task-goal-binding';
import type { TaskPlanOutcome as TaskPlanOutcomeValue } from '../../value-objects/task-plan-outcome';

/**
 * Authoritative Task Plan outcome transition fact (ADR-057 / SETTLE-3501).
 *
 * PlanCompletion settlement is driven exclusively by this fact. Occurrence
 * completion/skip/missed are inputs to the Task-owned evaluator; downstream
 * consumers never infer plan success from raw occurrence rows.
 */
export interface TaskPlanOutcomeChangedEvent {
  identityId: IdentityId;
  taskPlanId: TaskPlanId;
  triggeringTaskOccurrenceId: TaskOccurrenceId;
  taskTitle: string;
  goalBinding: TaskGoalBindingDTO | null;
  previousOutcome: TaskPlanOutcomeValue;
  nextOutcome: TaskPlanOutcomeValue;
  /** Optimistic-lock version after applying this transition. */
  planVersion: number;
  changedAt: number;
}
