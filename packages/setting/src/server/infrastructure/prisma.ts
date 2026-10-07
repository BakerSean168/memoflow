/** Canonical Setting Prisma composition helpers. */
import type { PrismaClient } from '@memoflow/database';
import {
  createSettingModule,
  type SettingModuleInstance,
  type SettingModuleRuntimeContribution,
} from './index';
import { UserPreferencePrismaRepository } from './adapters/prisma/user-preference-prisma.repository';
import { createUserPreferenceService, PreferenceUserTimeContextAdapter, type IUserPreferenceRepository } from '../preferences';

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

/**
 * Setting-owned bounded Product Time query for external application reads.
 * @param db - Host-owned PostgreSQL client.
 * @returns Identity-scoped time queries honoring the caller's deadline.
 */
export function createSettingPrismaTimeQuery(db: PrismaClient): import('@memoflow/time').UserTimeContextPort {
  return {
    async getUserTimeContext(identityId, budget) {
      const deadlineAt = budget?.deadlineAt ?? Date.now() + 30000;
      if (budget?.signal.aborted || Date.now() >= deadlineAt) throw new Error('Time read deadline exceeded');
      const remaining = Math.max(1, Math.min(30000, deadlineAt - Date.now()));
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(Math.max(1, Math.min(remaining, deadlineAt - Date.now())))}, true)`;
        const preferences = createUserPreferenceService(new UserPreferencePrismaRepository(tx));
        const result = await new PreferenceUserTimeContextAdapter(preferences).getUserTimeContext(identityId);
        if (budget?.signal.aborted || Date.now() >= deadlineAt) throw new Error('Time read deadline exceeded');
        return result;
      }, { timeout: remaining, maxWait: Math.min(remaining, 2000), isolationLevel: 'RepeatableRead' });
    },
  };
}
