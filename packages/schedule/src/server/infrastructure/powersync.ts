import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import type { IScheduleRepository } from '../domain';
import { PowerSyncScheduleRepository } from './adapters/powersync/schedule-powersync.repository';
import {
  createScheduleModule,
  type ScheduleModuleInstance,
  type ScheduleRuntimeContributionsInput,
} from './schedule.module';

export interface SchedulePowerSyncRepositories {
  readonly scheduleRepository: IScheduleRepository;
}

export function createSchedulePowerSyncRepositories(
  db: IElectronDatabase,
): SchedulePowerSyncRepositories {
  return {
    scheduleRepository: new PowerSyncScheduleRepository(db),
  };
}

export function createSchedulePowerSyncModule(
  db: IElectronDatabase,
  leaseCoordinator: LeaseCoordinatorPort,
  runtimeContributions?: ScheduleRuntimeContributionsInput,
): ScheduleModuleInstance {
  const repositories = createSchedulePowerSyncRepositories(db);
  return createScheduleModule({
    scheduleRepository: repositories.scheduleRepository,
    leaseCoordinator,
    runtimeContributions,
  });
}

export { PowerSyncScheduleRepository };
