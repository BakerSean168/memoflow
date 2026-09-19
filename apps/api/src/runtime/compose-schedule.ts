/**
 * Planner/Calendar + Temporal Engine host composition.
 *
 * The host creates both repository sets once. Orchestration consumes the
 * canonical Scheduler invocation repositories; Calendar consumes only its own
 * repository and the shared lease port supplied by Scheduler infrastructure.
 */
import {
  createScheduleModule,
  type SchedulePortableCapability,
  type ScheduleRepositorySet,
  type ScheduleEventApplicationPort,
} from '@memoflow/schedule';
import { createScheduleApiModule, type ScheduleApiModuleDef } from '@memoflow/schedule/api';
import {
  createSchedulerModule,
  createScheduledInvocationRuntimeContribution,
  type ScheduledInvocationHandlerRegistry,
  type SchedulerModuleRuntimeContribution,
  type SchedulerRepositorySet,
  type SchedulerRuntimeContributionsInput,
} from '@memoflow/scheduler';
import { createSchedulerApiModule, type SchedulerApiModuleDef } from '@memoflow/scheduler/api';

export interface ComposeScheduleDependencies {
  readonly calendarRepositories: ScheduleRepositorySet;
  readonly schedulerRepositories: SchedulerRepositorySet;
  readonly handlerRegistry: ScheduledInvocationHandlerRegistry;
  readonly schedulerRuntimeContributions?: SchedulerRuntimeContributionsInput;
}

export interface ComposedSchedule {
  readonly calendarModule: ScheduleApiModuleDef;
  readonly schedulerModule: SchedulerApiModuleDef;
  readonly portableCapability: SchedulePortableCapability;
  /** Schedule-owned Calendar Event read/command seam shared by transports. */
  readonly eventApi: ScheduleEventApplicationPort;
  readonly repositories: {
    readonly scheduleRepository: ScheduleRepositorySet['scheduleRepository'];
  };
}

function normalizeRuntimeContributions(
  input?: SchedulerRuntimeContributionsInput,
): readonly SchedulerModuleRuntimeContribution[] {
  if (!input) return [];
  return Array.isArray(input) ? Array.from(input) : [input as SchedulerModuleRuntimeContribution];
}

export function composeSchedule(dependencies: ComposeScheduleDependencies): ComposedSchedule {
  const queueRuntime = createScheduledInvocationRuntimeContribution({
    repository: dependencies.schedulerRepositories.scheduledInvocationRepository,
    handlerRegistry: dependencies.handlerRegistry,
    leaseCoordinator: dependencies.schedulerRepositories.leaseCoordinator,
  });

  const schedulerInstance = createSchedulerModule({
    scheduledInvocationRepository: dependencies.schedulerRepositories.scheduledInvocationRepository,
    invocationAttemptRepository: dependencies.schedulerRepositories.invocationAttemptRepository,
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
    portableCapability: calendarInstance.portableCapability,
    eventApi: calendarInstance.eventApi,
    repositories: {
      scheduleRepository: dependencies.calendarRepositories.scheduleRepository,
    },
  };
}
