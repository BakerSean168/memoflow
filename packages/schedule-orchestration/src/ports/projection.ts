import type { ScheduledHandlerRegistration, SchedulingPort } from '@memoflow/contracts/schedule';
import type { GoalScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import type { RoutineScheduleProjectionSource } from '@memoflow/reminder/schedule-projection/routine';
import type { RoutineTemporaryOverrideStore } from '@memoflow/reminder/schedule-execution/routine';
import type { ReminderScheduleProjectionSource } from '@memoflow/reminder/schedule-projection';
import type { IScheduleTaskRepository, ScheduleTask } from '@memoflow/scheduler';
import type { TaskScheduleProjectionSource } from '@memoflow/task/schedule-projection';
import type { ScheduleOrchestrationExecutionDeps } from './execution';
import type { ProjectionRepairMetricsReader } from './projection-repair';
import type { RuntimeContribution } from './runtime-contribution';

export interface ScheduleOrchestrationProjectionDeps<TSource> {
  readonly source: TSource;
}

/** Task still supplies the ScheduleTask persistence adapter that backs the neutral SchedulingPort. */
export interface ScheduleOrchestrationScheduleTaskProjectionDeps<
  TSource,
> extends ScheduleOrchestrationProjectionDeps<TSource> {
  readonly scheduleTaskRepository: IScheduleTaskRepository;
}

/** Composition-only registration surface; Scheduler core remains feature-neutral. */
export interface ScheduleOrchestrationHandlerRegistry {
  register<TPayload>(registration: ScheduledHandlerRegistration<TPayload>): void;
  has(handlerKey: string): boolean;
  keys(): readonly string[];
}

export interface ScheduleOrchestrationModule {
  readonly projectionRuntime: RuntimeContribution;
  /** Cumulative startup/manual durable repair outcomes for Task, Goal, Reminder, and Routine. */
  readonly projectionRepairMetrics: ProjectionRepairMetricsReader;
  readonly schedulingPort: SchedulingPort;
  readonly handlerRegistry: ScheduleOrchestrationHandlerRegistry;
  readonly sourceExecutor: {
    execute(task: ScheduleTask): Promise<{
      nextRunAt?: number | null;
      result?: Record<string, unknown>;
      disposition?: 'succeeded' | 'skipped' | 'failed' | 'dead_letter';
      error?: string;
    } | void>;
  };
  /**
   * ROUTINE-3401 durable snooze/suppress store bound for the routine wall-clock
   * lane. Writes publish `routine:override-changed` so the projection runtime
   * converges the durable Scheduler invocation; hosts bind it to their routine
   * snooze/command surface.
   */
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}

export interface CreateScheduleOrchestrationModuleOptions {
  readonly taskProjection: ScheduleOrchestrationScheduleTaskProjectionDeps<TaskScheduleProjectionSource>;
  readonly goalProjection: ScheduleOrchestrationProjectionDeps<GoalScheduleProjectionSource>;
  readonly reminderProjection: ScheduleOrchestrationProjectionDeps<ReminderScheduleProjectionSource>;
  readonly execution: ScheduleOrchestrationExecutionDeps;
  /** ROUTINE-3401 durable wall-clock lane; joining wires the handler + routine runtime. */
  readonly routineProjection?: ScheduleOrchestrationProjectionDeps<RoutineScheduleProjectionSource>;
  /** ROUTINE-3401 durable snooze/suppress store; wrapped to converge the Scheduler on write. */
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}
