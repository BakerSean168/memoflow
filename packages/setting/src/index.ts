/**
 * @memoflow/setting
 *
 * Setting module runtime root.
 *
 * Public setting contracts are centralized in `@memoflow/contracts/setting`.
 * Root exports are limited to the canonical server composition root:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths.
 *
 * 设置模块运行时根。
 * 公开契约集中在 `@memoflow/contracts/setting`。
 * 根导出仅限于规范化的服务端组合根：原料工厂、集合类型、模块工厂、
 * 运行时贡献工厂与 Port 类型。Client / API / Electron 使用独立 subpath。
 */

export {
  createSettingModule,
  createSettingPowerSyncModule,
  createSettingPowerSyncRepositories,
  createSettingPrismaModule,
  createSettingPrismaRepositories,
  createSettingPrismaRepository,
  createSettingRuntimeContribution,
  type SettingModuleDependencies,
  type SettingModuleInstance,
  type CreateSettingPrismaModuleOptions,
  type SettingPrismaRepositorySet,
  type SettingPowerSyncRepositorySet,
  type IUserSettingRepository,
  createUserPreferenceService,
  type UserPreferenceService,
  type IUserPreferenceRepository,
  type PreferenceMutationResult,
  type ResetUserPreferencesResult,
} from './server';
export type { SettingApplicationPort } from './server';
