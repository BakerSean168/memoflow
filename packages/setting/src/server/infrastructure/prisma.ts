/**
 * Setting Prisma Composition Helpers
 * 设置模块 Prisma 组合辅助函数
 *
 * Host-facing ingredient seams: the repository set type, the repository
 * factory and the delegating convenience module factory.
 *
 * 面向宿主的组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createSettingModule,
  type SettingModuleInstance,
  type SettingModuleRuntimeContribution,
} from './index';
import { UserPreferencePrismaRepository, UserSettingPrismaRepository } from './adapters/prisma';
import type { IUserSettingRepository } from '../domain/repositories/i-user-setting-repository';
import type { IUserPreferenceRepository } from '../preferences';

export interface CreateSettingPrismaModuleOptions {
  readonly runtimeContributions?:
    SettingModuleRuntimeContribution | readonly SettingModuleRuntimeContribution[];
}

/**
 * Host-facing setting repository set for the Prisma lane.
 * 面向宿主暴露的 Prisma lane 设置仓储集合。
 */
export interface SettingPrismaRepositorySet {
  readonly userSettingRepository: IUserSettingRepository;
  readonly userPreferenceRepository: IUserPreferenceRepository;
}

/**
 * Creates Prisma-backed setting repositories.
 * 创建基于 Prisma 的设置仓储。
 *
 * Host-level composition ingredient: selects the Prisma adapter and returns
 * the repository Port shape.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回仓储 Port 形状。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns Repository set backed by the Prisma adapter.
 *          返回基于 Prisma 适配器的仓储集合。
 */
export function createSettingPrismaRepositories(db: PrismaClient): SettingPrismaRepositorySet {
  return {
    userSettingRepository: new UserSettingPrismaRepository(db),
    userPreferenceRepository: new UserPreferencePrismaRepository(db),
  };
}

/**
 * Create a fully-wired setting module backed by Prisma repositories.
 * 创建基于 Prisma 仓储的完整设置模块。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createSettingPrismaRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createSettingPrismaRepositories() 与规范化模块装配。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param options - Optional runtime contributions. 可选的运行时贡献。
 * @returns SettingModuleInstance with Prisma-backed repositories attached.
 *          返回挂载 Prisma 仓储的设置模块实例。
 */
export function createSettingPrismaModule(
  db: PrismaClient,
  options: CreateSettingPrismaModuleOptions = {},
): SettingModuleInstance {
  const repositories = createSettingPrismaRepositories(db);

  return createSettingModule({
    userSettingRepository: repositories.userSettingRepository,
    userPreferenceRepository: repositories.userPreferenceRepository,
    runtimeContributions: options.runtimeContributions,
  });
}

/**
 * Create a standalone UserSetting repository.
 * 创建独立的 UserSetting 仓储。
 */
export function createSettingPrismaRepository(db: PrismaClient) {
  return createSettingPrismaRepositories(db).userSettingRepository;
}
