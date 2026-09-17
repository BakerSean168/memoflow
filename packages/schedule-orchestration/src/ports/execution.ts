import type { RoutineScheduleExecutionDeps } from '@memoflow/reminder/schedule-execution/routine';

/**
 * Canonical owner execution dependencies.
 *
 * Legacy Reminder execution is retired. Routine wall-clock work is the
 * only Routine/Reminder-family scheduled execution lane.
 */
export interface ScheduleOrchestrationExecutionDeps {
  readonly routineSource?: RoutineScheduleExecutionDeps;
}
