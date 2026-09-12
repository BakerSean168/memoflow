import type { TaskPlanServerDTO } from '../../aggregates/task-plan-server';
import type { RecurrenceRuleDTO } from '../../value-objects/recurrence-rule';
import type { IdentityId } from '../../../../primitives';

export interface TaskPlanRecurrenceChangedEvent {
  identityId: IdentityId;
  taskPlan: TaskPlanServerDTO;
  oldRecurrenceRule: RecurrenceRuleDTO | null;
  newRecurrenceRule: RecurrenceRuleDTO | null;
}
