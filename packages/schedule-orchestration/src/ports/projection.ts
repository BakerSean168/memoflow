import type {
  ScheduledHandlerRegistration,
  ScheduledHandlerResult,
  ScheduledInvocationContext,
  SchedulingPort,
} from '@memoflow/contracts/schedule';
import type { GoalScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import type { RoutineScheduleProjectionSource } from '@memoflow/reminder/schedule-projection/routine';
import type { RoutineTemporaryOverrideStore } from '@memoflow/reminder/schedule-execution/routine';
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
  /** Cumulative startup/manual durable repair outcomes for Task, Goal and Routine. */
  readonly projectionRepairMetrics: ProjectionRepairMetricsReader;
  readonly schedulingPort: SchedulingPort;
  readonly handlerRegistry: ScheduleOrchestrationHandlerRegistry;
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}

export interface CreateScheduleOrchestrationModuleOptions {
  readonly scheduler: ScheduleOrchestrationSchedulerDeps;
  readonly taskProjection: ScheduleOrchestrationProjectionDeps<TaskScheduleProjectionSource>;
  readonly goalProjection: ScheduleOrchestrationProjectionDeps<GoalScheduleProjectionSource>;
  readonly execution: ScheduleOrchestrationExecutionDeps;
  readonly routineProjection?: ScheduleOrchestrationProjectionDeps<RoutineScheduleProjectionSource>;
  readonly routineOverrideStore?: RoutineTemporaryOverrideStore;
}
