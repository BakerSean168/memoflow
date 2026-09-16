import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { IScheduleLeaseRepository } from '../application/ports/schedule-lease.port';
import type {
  IScheduleExecutionRepository,
  IScheduleTaskRepository,
} from '../domain';
import {
  PowerSyncScheduleExecutionRepository,
  PowerSyncScheduleTaskRepository,
  PowerSyncScheduledInvocationRepository,
} from './adapters/powersync';
import { createScheduleLeasePowerSyncRepository } from './lease/schedule-lease.repository';
import { ScheduleLeaseCoordinator } from './lease/schedule-lease-coordinator';
import {
  createSchedulerModule,
  type SchedulerModuleInstance,
  type SchedulerRuntimeContributionsInput,
} from './scheduler.module';

export interface SchedulerPowerSyncRepositories {
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly scheduledInvocationRepository: PowerSyncScheduledInvocationRepository;
  readonly leaseCoordinator: ScheduleLeaseCoordinator;
  readonly leaseRepository: IScheduleLeaseRepository;
}

export function createSchedulerPowerSyncRepositories(
  db: IElectronDatabase,
): SchedulerPowerSyncRepositories {
  const leaseRepository = createScheduleLeasePowerSyncRepository(db);
  return {
    scheduleTaskRepository: new PowerSyncScheduleTaskRepository(db),
    scheduleExecutionRepository: new PowerSyncScheduleExecutionRepository(db),
    scheduledInvocationRepository: new PowerSyncScheduledInvocationRepository(db),
    leaseCoordinator: new ScheduleLeaseCoordinator(leaseRepository),
    leaseRepository,
  };
}

export function createSchedulerPowerSyncModule(
  db: IElectronDatabase,
  runtimeContributions?: SchedulerRuntimeContributionsInput,
): SchedulerModuleInstance {
  const repositories = createSchedulerPowerSyncRepositories(db);
  return createSchedulerModule({
    scheduleTaskRepository: repositories.scheduleTaskRepository,
    scheduleExecutionRepository: repositories.scheduleExecutionRepository,
    scheduledInvocationRepository: repositories.scheduledInvocationRepository,
    runtimeContributions,
  });
}
