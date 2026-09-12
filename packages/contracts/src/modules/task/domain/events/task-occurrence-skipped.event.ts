import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '../../../../primitives';

export interface TaskOccurrenceSkippedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  skippedAt: number;
  reason: string | null;
}
