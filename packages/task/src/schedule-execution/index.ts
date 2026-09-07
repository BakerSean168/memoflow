import type { ScheduleTask } from '@memoflow/scheduler';

export interface TaskScheduleExecutionOutcome {
  readonly nextRunAt?: number | null;
  readonly result?: Record<string, unknown>;
}

export interface TaskScheduleExecutionSource {
  executeTask(task: ScheduleTask): Promise<TaskScheduleExecutionOutcome>;
}

export {
  createTaskPrismaScheduleExecutionSource,
  createTaskPowerSyncScheduleExecutionSource,
  createTaskScheduleExecutionSource,
  type CreateTaskScheduleExecutionSourceDeps,
} from '../server/infrastructure';

export {
  createTaskReminderScheduledHandlerRegistration,
  buildTaskReminderOperationId,
  TASK_REMINDER_BUSINESS_SOURCE,
  TASK_REMINDER_WORKFLOW_KEY,
  type CreateTaskReminderScheduledHandlerRegistrationDeps,
} from '../server/infrastructure';
