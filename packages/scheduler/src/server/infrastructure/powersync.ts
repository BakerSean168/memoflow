import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { IScheduleLeaseRepository } from '../application/ports/schedule-lease.port';
import {
  PowerSyncInvocationAttemptRepository,
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
  readonly scheduledInvocationRepository: PowerSyncScheduledInvocationRepository;
  readonly invocationAttemptRepository: PowerSyncInvocationAttemptRepository;
  readonly leaseCoordinator: ScheduleLeaseCoordinator;
  readonly leaseRepository: IScheduleLeaseRepository;
}

export function createSchedulerPowerSyncRepositories(
  db: IElectronDatabase,
): SchedulerPowerSyncRepositories {
  const leaseRepository = createScheduleLeasePowerSyncRepository(db);
  return {
    scheduledInvocationRepository: new PowerSyncScheduledInvocationRepository(db),
    invocationAttemptRepository: new PowerSyncInvocationAttemptRepository(db),
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
    scheduledInvocationRepository: repositories.scheduledInvocationRepository,
    invocationAttemptRepository: repositories.invocationAttemptRepository,
    runtimeContributions,
  });
}
