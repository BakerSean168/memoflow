import type {
  ReminderScheduleExecutionSource,
  RoutineScheduleExecutionDeps,
} from '@memoflow/reminder/schedule-execution';

/**
 * Business execution dependencies that still need host-owned persistence.
 * Task and Goal execute exclusively through registered neutral handlers; the
 * Reminder source remains an internal Reminder-owned atomic commit boundary and
 * is adapted to a handler during orchestration composition.
 */
export interface ScheduleOrchestrationExecutionDeps {
  readonly reminderSource: ReminderScheduleExecutionSource;
  /** ROUTINE durable execution deps; when present the module builds the wall-clock fence source. */
  readonly routineSource?: RoutineScheduleExecutionDeps;
}
