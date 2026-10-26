import type { IdentityId, TaskOccurrenceId, TaskPlanId } from '@memoflow/shared-primitives';

export interface TaskOccurrenceSkippedEvent {
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  skippedAt: number;
  reason: string | null;
}
