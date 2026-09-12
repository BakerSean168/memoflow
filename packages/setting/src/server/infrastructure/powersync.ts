/** Canonical Setting PowerSync composition helpers. */
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IUserPreferenceRepository } from '../preferences';
import { createSettingModule, type SettingModuleInstance } from './setting.module';
import { UserPreferencePowerSyncRepository } from './adapters/powersync/user-preference-powersync.repository';

export interface SettingPowerSyncRepositorySet {
  readonly userPreferenceRepository: IUserPreferenceRepository;
}

export function createSettingPowerSyncRepositories(
  dbConnection: IElectronDatabaseTransaction,
): SettingPowerSyncRepositorySet {
  return { userPreferenceRepository: new UserPreferencePowerSyncRepository(dbConnection) };
}

export function createSettingPowerSyncModule(
  dbConnection: IElectronDatabaseTransaction,
): SettingModuleInstance {
  const repositories = createSettingPowerSyncRepositories(dbConnection);
  return createSettingModule({ userPreferenceRepository: repositories.userPreferenceRepository });
}
