import type { ScheduleTask } from '@memoflow/scheduler';

export interface GoalScheduleExecutionOutcome {
  readonly nextRunAt?: number | null;
  readonly result?: Record<string, unknown>;
}

export interface GoalScheduleExecutionSource {
  executeGoal(task: ScheduleTask): Promise<GoalScheduleExecutionOutcome>;
}

export {
  createGoalPrismaScheduleExecutionSource,
  createGoalPowerSyncScheduleExecutionSource,
  createGoalScheduleExecutionSource,
  type CreateGoalScheduleExecutionSourceDeps,
} from '../server/infrastructure';

export {
  createGoalPrismaReminderFireHandler,
  createGoalPowerSyncReminderFireHandler,
  createGoalReminderFireHandler,
  GOAL_REMINDER_NOTIFICATION_SOURCE,
  GOAL_REMINDER_WORKFLOW_KEY,
  GoalReminderFirePayloadSchema,
  buildGoalReminderOperationId,
  type CreateGoalReminderFireHandlerDeps,
  type GoalReminderFirePayload,
} from '../server/infrastructure';
