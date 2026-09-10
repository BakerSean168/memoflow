import {
  createUserPreferenceService,
  PreferenceUserTimeContextAdapter,
  PreferencePortableService,
  createPreferencePortableCapability,
  type PreferencePortableCapability,
  type IUserPreferenceRepository,
  type UserPreferenceService,
} from '../preferences';
import type { UserTimeContextPort } from '@memoflow/time';
import { ExportSettings, ImportSettings } from '../application';
import type { SettingApplicationPort } from '../application';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('SettingModule');

/** Setting runtime side effects. */
export interface SettingModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export type SettingRuntimeContributionsInput =
  | SettingModuleRuntimeContribution
  | readonly SettingModuleRuntimeContribution[];

/** Canonical Setting dependencies: namespace preference persistence only. */
export interface SettingModuleDependencies {
  readonly userPreferenceRepository: IUserPreferenceRepository;
  readonly runtimeContributions?: SettingRuntimeContributionsInput;
}

export interface SettingModuleUseCases {
  readonly exportSettings: ExportSettings;
  readonly importSettings: ImportSettings;
}

export interface SettingModuleInstance {
  readonly userPreferenceRepository: IUserPreferenceRepository;
  readonly preferenceService: UserPreferenceService;
  readonly portableCapability: PreferencePortableCapability;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly useCases: SettingModuleUseCases;
  readonly api: SettingApplicationPort;
  start(): void;
  dispose(): void;
}

export function createSettingUseCases(
  preferencePortableService: PreferencePortableService,
): SettingModuleUseCases {
  return {
    exportSettings: new ExportSettings(preferencePortableService),
    importSettings: new ImportSettings(preferencePortableService),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?: SettingRuntimeContributionsInput,
): readonly SettingModuleRuntimeContribution[] {
  if (!runtimeContributions) return [];
  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as SettingModuleRuntimeContribution];
}

/** Canonical Setting composition root. */
export function createSettingModule(
  dependencies: SettingModuleDependencies,
): SettingModuleInstance {
  const { userPreferenceRepository } = dependencies;
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  const preferenceService = createUserPreferenceService(userPreferenceRepository);
  const preferencePortableService = new PreferencePortableService(preferenceService);
  const portableCapability = createPreferencePortableCapability(preferenceService);
  const useCases = createSettingUseCases(preferencePortableService);
  const userTimeContextPort = new PreferenceUserTimeContextAdapter(preferenceService);
  let started = false;

  return {
    userPreferenceRepository,
    preferenceService,
    portableCapability,
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
      exportSettings: (identityId) => useCases.exportSettings.execute(identityId),
      importSettings: (identityId, data) => useCases.importSettings.execute(identityId, data),
    },
    start(): void {
      if (started) return;
      const startedContributions: SettingModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
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
      for (const runtime of [...runtimeContributions].reverse()) runtime.stop();
      started = false;
    },
  };
}
