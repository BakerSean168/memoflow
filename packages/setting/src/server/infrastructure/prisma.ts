/** Canonical Setting Prisma composition helpers. */
import type { PrismaClient } from '@memoflow/database';
import {
  createSettingModule,
  type SettingModuleInstance,
  type SettingModuleRuntimeContribution,
} from './index';
import { UserPreferencePrismaRepository } from './adapters/prisma/user-preference-prisma.repository';
import type { IUserPreferenceRepository } from '../preferences';

export interface CreateSettingPrismaModuleOptions {
  readonly runtimeContributions?:
    SettingModuleRuntimeContribution | readonly SettingModuleRuntimeContribution[];
}

export interface SettingPrismaRepositorySet {
  readonly userPreferenceRepository: IUserPreferenceRepository;
}

export function createSettingPrismaRepositories(db: PrismaClient): SettingPrismaRepositorySet {
  return { userPreferenceRepository: new UserPreferencePrismaRepository(db) };
}

export function createSettingPrismaModule(
  db: PrismaClient,
  options: CreateSettingPrismaModuleOptions = {},
): SettingModuleInstance {
  const repositories = createSettingPrismaRepositories(db);
  return createSettingModule({
    userPreferenceRepository: repositories.userPreferenceRepository,
    runtimeContributions: options.runtimeContributions,
  });
}
