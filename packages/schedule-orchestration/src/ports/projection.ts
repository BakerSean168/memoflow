import type {
  ScheduledHandlerRegistration,
  ScheduledHandlerResult,
  ScheduledInvocationContext,
  SchedulingPort,
} from '@memoflow/contracts/schedule';
import type { GoalScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import type { RoutineScheduleProjectionSource } from '@memoflow/reminder/schedule-projection/routine';
import type { RoutineTemporaryOverrideStore } from '@memoflow/reminder/schedule-execution/routine';
import type { ReminderScheduleProjectionSource } from '@memoflow/reminder/schedule-projection';
import type { IScheduledInvocationRepository } from '@memoflow/scheduler';
import type { TaskScheduleProjectionSource } from '@memoflow/task/schedule-projection';
import type { ScheduleOrchestrationExecutionDeps } from './execution';
import type { ProjectionRepairMetricsReader } from './projection-repair';
import type { RuntimeContribution } from './runtime-contribution';

export interface ScheduleOrchestrationProjectionDeps<TSource> {
  readonly source: TSource;
}

export interface ScheduleOrchestrationSchedulerDeps {
  readonly invocationRepository: IScheduledInvocationRepository;
}

/** Composition-only registration surface; Scheduler core remains feature-neutral. */
export interface ScheduleOrchestrationHandlerRegistry {
  register<TPayload>(registration: ScheduledHandlerRegistration<TPayload>): void;
  has(handlerKey: string): boolean;
  keys(): readonly string[];
  execute(context: ScheduledInvocationContext): Promise<ScheduledHandlerResult>;
}

export interface ScheduleOrchestrationModule {
  readonly projectionRuntime: RuntimeContribution;
  /** Cumulative startup/manual durable repair outcomes for Task, Goal, Reminder, and Routine. */
  readonly projectionRepairMetrics: ProjectionRepairMetricsReader;
  readonly schedulingPort: SchedulingPort;
  readonly handlerRegistry: ScheduleOrchestrationHandlerRegistry;
  /**
   * ROUTINE-3401 durable snooze/suppress store bound for the routine wall-clock
   * lane. Writes publish `routine:override-changed` so the projection runtime
   * converges the durable Scheduler invocation; hosts bind it to their routine
   * snooze/command surface.
   */
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}

export interface CreateScheduleOrchestrationModuleOptions {
  readonly scheduler: ScheduleOrchestrationSchedulerDeps;
  readonly taskProjection: ScheduleOrchestrationProjectionDeps<TaskScheduleProjectionSource>;
  readonly goalProjection: ScheduleOrchestrationProjectionDeps<GoalScheduleProjectionSource>;
  readonly reminderProjection: ScheduleOrchestrationProjectionDeps<ReminderScheduleProjectionSource>;
  readonly execution: ScheduleOrchestrationExecutionDeps;
  /** ROUTINE durable wall-clock projection; enabled once the host provides it. */
  readonly routineProjection?: ScheduleOrchestrationProjectionDeps<RoutineScheduleProjectionSource>;
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}
