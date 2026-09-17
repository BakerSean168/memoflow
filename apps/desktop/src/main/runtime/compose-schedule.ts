/** Planner/Calendar + Temporal Engine composition for the desktop lane. */
import {
  createScheduleModule,
  type IScheduleRepository,
  type SchedulePowerSyncRepositories,
} from '@memoflow/schedule';
import {
  createScheduleElectronModule,
  type ScheduleElectronModuleDef,
} from '@memoflow/schedule/electron';
import {
  createSchedulerModule,
  createScheduledInvocationRuntimeContribution,
  type ScheduledInvocationHandlerRegistry,
  type SchedulerModuleRuntimeContribution,
  type SchedulerPowerSyncRepositories,
  type SchedulerRuntimeContributionsInput,
} from '@memoflow/scheduler';
import {
  createSchedulerElectronModule,
  type SchedulerElectronModuleDef,
} from '@memoflow/scheduler/electron';

export interface ScheduleRuntimeController {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export interface ComposeScheduleDesktopDependencies {
  readonly calendarRepositories: SchedulePowerSyncRepositories;
  readonly schedulerRepositories: SchedulerPowerSyncRepositories;
  readonly handlerRegistry: ScheduledInvocationHandlerRegistry;
  readonly schedulerRuntimeContributions?: SchedulerRuntimeContributionsInput;
  readonly shouldExecuteIdentity?: (identityId: string) => boolean | Promise<boolean>;
}

export interface ComposedScheduleElectron {
  readonly calendarModule: ScheduleElectronModuleDef;
  readonly schedulerModule: SchedulerElectronModuleDef;
  readonly repositories: {
    readonly scheduleRepository: IScheduleRepository;
  };
  readonly runtimeController: ScheduleRuntimeController;
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
  dependencies: ComposeScheduleDesktopDependencies,
): ComposedScheduleElectron {
  const queueRuntime = createScheduledInvocationRuntimeContribution({
    repository: dependencies.schedulerRepositories.scheduledInvocationRepository,
    handlerRegistry: dependencies.handlerRegistry,
    leaseCoordinator: dependencies.schedulerRepositories.leaseCoordinator,
    shouldExecuteIdentity: dependencies.shouldExecuteIdentity,
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
  });

  const calendarModule = createScheduleElectronModule({ instance: calendarInstance });
  const schedulerModule = createSchedulerElectronModule({ instance: schedulerInstance });
  const runtimeController: ScheduleRuntimeController = {
    async start() {
      await calendarModule.runtime.start();
      try {
        await schedulerModule.runtime.start();
      } catch (error) {
        await calendarModule.runtime.stop();
        throw error;
      }
    },
    async stop() {
      await schedulerModule.runtime.stop();
      await calendarModule.runtime.stop();
    },
  };

  return {
    calendarModule,
    schedulerModule,
    repositories: {
      scheduleRepository: dependencies.calendarRepositories.scheduleRepository,
    },
    runtimeController,
  };
}
