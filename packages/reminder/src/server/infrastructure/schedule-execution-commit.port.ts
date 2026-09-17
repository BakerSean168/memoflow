import type { NotificationRequestedOutboxInput } from '@memoflow/contracts/notification';
import type { ReminderTemplate } from '../domain/aggregates/reminder-template';

/**
 * Reminder-owned atomic commit boundary for the canonical ScheduledInvocation execution
 * seam during NOTIF-3302 migration. Scheduler never sees Notification types.
 */
export interface ReminderScheduleExecutionCommitInput {
  readonly template: ReminderTemplate;
  /** The exact due timestamp claimed by the Scheduler task. */
  readonly expectedNextTriggerAt: number;
  readonly notificationRequested: NotificationRequestedOutboxInput;
}

export interface ReminderScheduleExecutionCommitResult {
  readonly applied: boolean;
  readonly nextRunAt: number | null;
  readonly notificationOperationId: string | null;
}

export interface ReminderScheduleExecutionCommitPort {
  commit(
    input: ReminderScheduleExecutionCommitInput,
  ): Promise<ReminderScheduleExecutionCommitResult>;
}
