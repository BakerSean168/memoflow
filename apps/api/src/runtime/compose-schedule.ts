/**
 * Planner/Calendar + Temporal Engine host composition.
 *
 * The host creates both repository sets once. Orchestration consumes the
 * Scheduler task repository; Calendar consumes only its own repository and a
 * shared lease port supplied by the Scheduler infrastructure set.
 */
import {
  createScheduleModule,
  type ScheduleRepositorySet,
} from '@memoflow/schedule';
import {
  createScheduleApiModule,
  type ScheduleApiModuleDef,
} from '@memoflow/schedule/api';
import {
  createSchedulerModule,
  createSchedulerRuntimeContribution,
  type ScheduleTask,
  type ScheduleTaskSourceExecutor,
  type SchedulerModuleRuntimeContribution,
  type SchedulerRepositorySet,
  type SchedulerRuntimeContributionsInput,
} from '@memoflow/scheduler';
import {
  createSchedulerApiModule,
  type SchedulerApiModuleDef,
} from '@memoflow/scheduler/api';

export interface ComposeScheduleDependencies {
  readonly calendarRepositories: ScheduleRepositorySet;
  readonly schedulerRepositories: SchedulerRepositorySet;
  readonly sourceExecutor: ScheduleTaskSourceExecutor;
  readonly schedulerRuntimeContributions?: SchedulerRuntimeContributionsInput;
  readonly shouldScheduleTask?: (task: ScheduleTask) => boolean | Promise<boolean>;
}

export interface ComposedSchedule {
  readonly calendarModule: ScheduleApiModuleDef;
  readonly schedulerModule: SchedulerApiModuleDef;
  readonly repositories: {
    readonly scheduleRepository: ScheduleRepositorySet['scheduleRepository'];
    readonly scheduleTaskRepository: SchedulerRepositorySet['scheduleTaskRepository'];
  };
}

function normalizeRuntimeContributions(
  input?: SchedulerRuntimeContributionsInput,
): readonly SchedulerModuleRuntimeContribution[] {
  if (!input) return [];
  return Array.isArray(input)
    ? Array.from(input)
    : [input as SchedulerModuleRuntimeContribution];
}

export function composeSchedule(
  dependencies: ComposeScheduleDependencies,
): ComposedSchedule {
  const queueRuntime = createSchedulerRuntimeContribution({
    scheduleTaskRepository: dependencies.schedulerRepositories.scheduleTaskRepository,
    sourceExecutor: dependencies.sourceExecutor,
    leaseCoordinator: dependencies.schedulerRepositories.leaseCoordinator,
    shouldScheduleTask: dependencies.shouldScheduleTask,
  });

  const schedulerInstance = createSchedulerModule({
    scheduleTaskRepository: dependencies.schedulerRepositories.scheduleTaskRepository,
    scheduleExecutionRepository: dependencies.schedulerRepositories.scheduleExecutionRepository,
    runtimeContributions: [
      queueRuntime,
      ...normalizeRuntimeContributions(dependencies.schedulerRuntimeContributions),
    ],
  });

  const calendarInstance = createScheduleModule({
    scheduleRepository: dependencies.calendarRepositories.scheduleRepository,
    leaseCoordinator: dependencies.schedulerRepositories.leaseCoordinator,
    eventDeliveryLogConsumer: dependencies.calendarRepositories.eventDeliveryLogConsumer,
    auditRepository: dependencies.calendarRepositories.auditRepository,
  });

  return {
    calendarModule: createScheduleApiModule({ instance: calendarInstance }),
    schedulerModule: createSchedulerApiModule({ instance: schedulerInstance }),
    repositories: {
      scheduleRepository: dependencies.calendarRepositories.scheduleRepository,
      scheduleTaskRepository: dependencies.schedulerRepositories.scheduleTaskRepository,
    },
  };
}
