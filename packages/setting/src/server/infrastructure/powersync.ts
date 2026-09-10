/**
 * Setting PowerSync composition helpers.
 * 设置模块 PowerSync 组合辅助函数。
 *
 * Host-facing ingredient seams for the Electron lane: the repository set type,
 * the repository factory and the delegating convenience module factory.
 *
 * 面向宿主的 Electron lane 组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 */

import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IUserSettingRepository } from '../domain/repositories/i-user-setting-repository';
import type { IUserPreferenceRepository } from '../preferences';
import { createSettingModule, type SettingModuleInstance } from './setting.module';
import { UserPreferencePowerSyncRepository } from './adapters/powersync/user-preference-powersync.repository';
import { UserSettingPowerSyncRepository } from './adapters/powersync/user-setting-powersync.repository';

/**
 * Host-facing setting repository set for the PowerSync lane.
 * 面向宿主暴露的 PowerSync lane 设置仓储集合。
 */
export interface SettingPowerSyncRepositorySet {
  readonly userSettingRepository: IUserSettingRepository;
  readonly userPreferenceRepository: IUserPreferenceRepository;
}

/**
 * Creates PowerSync-backed setting repositories.
 * 创建基于 PowerSync 的设置仓储。
 *
 * Electron counterpart of createSettingPrismaRepositories(): selects the
 * PowerSync adapter and returns the repository Port shape.
 *
 * 与 createSettingPrismaRepositories() 对应的 Electron 版本：选择 PowerSync
 * 适配器并返回仓储 Port 形状。
 *
 * @param dbConnection - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns Repository set backed by the PowerSync adapter.
 *          返回基于 PowerSync 适配器的仓储集合。
 */
export function createSettingPowerSyncRepositories(
  dbConnection: IElectronDatabaseTransaction,
): SettingPowerSyncRepositorySet {
  return {
    userSettingRepository: new UserSettingPowerSyncRepository(
      dbConnection,
    ) as IUserSettingRepository,
    userPreferenceRepository: new UserPreferencePowerSyncRepository(dbConnection),
  };
}

export function createSettingPowerSyncModule(
  dbConnection: IElectronDatabaseTransaction,
): SettingModuleInstance {
  const repositories = createSettingPowerSyncRepositories(dbConnection);

  return createSettingModule({
    userSettingRepository: repositories.userSettingRepository,
    userPreferenceRepository: repositories.userPreferenceRepository,
    persistMissingSettingOnRead: false,
  });
}

export { UserSettingPowerSyncRepository };
