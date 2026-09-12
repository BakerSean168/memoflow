/**
 * Setting server infrastructure layer.
 * 设置模块服务端基础设施层。
 *
 * Public seam: ingredient factories, set types, module factory, runtime
 * contribution factories and port types. Concrete adapter classes do not leak
 * through this barrel — the R1 lesson applied to the goal/task migration.
 *
 * 公共 seam：仅导出原料工厂、集合类型、模块工厂、运行时贡献工厂与 Port 类型。
 * 具体适配器类不通过该 barrel 泄漏——目标/任务迁移的 R1 教训。
 */

export {
  createSettingModule,
  createSettingUseCases,
  type SettingModuleDependencies,
  type SettingModuleInstance,
  type SettingModuleRuntimeContribution,
  type SettingModuleUseCases,
} from './setting.module';
export type { SettingApplicationPort } from '../application';

export {
  createSettingPrismaModule,
  createSettingPrismaRepositories,
  type CreateSettingPrismaModuleOptions,
  type SettingPrismaRepositorySet,
} from './prisma';
export {
  createSettingPowerSyncModule,
  createSettingPowerSyncRepositories,
  type SettingPowerSyncRepositorySet,
} from './powersync';
export {
  createSettingRuntimeContribution,
} from './runtime';
