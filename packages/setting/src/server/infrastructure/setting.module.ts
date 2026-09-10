import type { IUserSettingRepository } from '../domain/repositories/i-user-setting-repository';
import {
  createUserPreferenceService,
  PreferenceUserTimeContextAdapter,
  type IUserPreferenceRepository,
  type UserPreferenceService,
} from '../preferences';
import type { UserTimeContextPort } from '@memoflow/time';

import {
  GetUserSetting,
  PatchUserSetting,
  ResetUserSetting,
  ExportSettings,
  ImportSettings,
  GetDefaultSettings,
} from '../application';
import type { SettingApplicationPort } from '../application';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('SettingModule');

/** Setting runtime side effects. Setting 模块拥有的运行时副作用。 */
export interface SettingModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export type SettingRuntimeContributionsInput =
  | SettingModuleRuntimeContribution
  | readonly SettingModuleRuntimeContribution[];

/** Explicit dependencies for the setting server runtime. Setting 服务端运行时的显式依赖。 */
export interface SettingModuleDependencies {
  readonly userSettingRepository: IUserSettingRepository;
  readonly userPreferenceRepository: IUserPreferenceRepository;
  readonly runtimeContributions?: SettingRuntimeContributionsInput;
  readonly persistMissingSettingOnRead?: boolean;
}

/** Lower-level use case graph kept for tests and diagnostics. */
export interface SettingModuleUseCases {
  readonly getUserSetting: GetUserSetting;
  readonly patchUserSetting: PatchUserSetting;
  readonly resetUserSetting: ResetUserSetting;
  readonly exportSettings: ExportSettings;
  readonly importSettings: ImportSettings;
  readonly getDefaultSettings: GetDefaultSettings;
}

export interface SettingModuleInstance {
  readonly userSettingRepository: IUserSettingRepository;
  readonly userPreferenceRepository: IUserPreferenceRepository;
  readonly preferenceService: UserPreferenceService;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly useCases: SettingModuleUseCases;
  readonly api: SettingApplicationPort;
  start(): void;
  dispose(): void;
}

export function createSettingUseCases(
  dependencies: SettingModuleDependencies,
): SettingModuleUseCases {
  const { userSettingRepository } = dependencies;

  return {
    getUserSetting: new GetUserSetting(userSettingRepository, {
      persistOnMissing: dependencies.persistMissingSettingOnRead,
    }),
    patchUserSetting: new PatchUserSetting(userSettingRepository),
    resetUserSetting: new ResetUserSetting(userSettingRepository),
    exportSettings: new ExportSettings(userSettingRepository),
    importSettings: new ImportSettings(userSettingRepository),
    getDefaultSettings: new GetDefaultSettings(),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?: SettingRuntimeContributionsInput,
): readonly SettingModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as SettingModuleRuntimeContribution];
}

/**
 * Canonical setting composition root.
 * 规范化的 setting 模块组合根。
 */
export function createSettingModule(
  dependencies: SettingModuleDependencies,
): SettingModuleInstance {
  const { userSettingRepository, userPreferenceRepository } = dependencies;
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  const useCases = createSettingUseCases(dependencies);
  const preferenceService = createUserPreferenceService(userPreferenceRepository);
  const userTimeContextPort = new PreferenceUserTimeContextAdapter(preferenceService);
  let started = false;

  return {
    userSettingRepository,
    userPreferenceRepository,
    preferenceService,
    userTimeContextPort,
    useCases,
    api: {
      getPreferenceProfile: (identityId) => preferenceService.getPreferenceProfile(identityId),
      getPreferenceNamespace: (identityId, namespace) =>
        preferenceService.getPreferenceNamespace(identityId, namespace),
      patchPreferenceNamespace: (identityId, namespace, patch, expectedRevision) =>
        preferenceService.patchPreferenceNamespace(identityId, namespace, patch, expectedRevision),
      resetPreferenceNamespace: (identityId, namespace, expectedRevision) =>
        preferenceService.resetPreferenceNamespace(identityId, namespace, expectedRevision),
      resetUserPreferences: (identityId, expectedRevisions) =>
        preferenceService.resetUserPreferences(identityId, expectedRevisions),
      getUserSetting: (identityId) => useCases.getUserSetting.execute(identityId),
      patchUserSetting: (identityId, category, patch) =>
        useCases.patchUserSetting.execute(identityId, category, patch),
      resetUserSetting: (identityId, category) =>
        useCases.resetUserSetting.execute(identityId, category),
      exportSettings: (identityId) => useCases.exportSettings.execute(identityId),
      importSettings: (identityId, data, options) =>
        useCases.importSettings.execute(identityId, data, options),
      getDefaultSettings: () => useCases.getDefaultSettings.execute(),
    },
    start(): void {
      if (started) return;
      const startedContributions: SettingModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: stop the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'SettingModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }
      started = true;
    },
    dispose(): void {
      if (!started) return;
      for (const runtime of [...runtimeContributions].reverse()) {
        runtime.stop();
      }
      started = false;
    },
  };
}
