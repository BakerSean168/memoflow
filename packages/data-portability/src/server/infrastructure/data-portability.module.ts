import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { DataPortabilityApplicationPort } from '../application';
import { PortableCapabilityRegistry } from '../application/portable-capability';
import type { DataPortabilityDependencies } from '../application/data-portability.dependencies';
import type { DataPortabilityImportStore } from '../application/import-store/data-portability-import-store';
import { ExportUserDataUseCase } from '../application/use-cases/export-user-data.use-case';
import { ImportUserDataUseCase } from '../application/use-cases/import-user-data.use-case';
import { createPowerSyncDataPortabilityDependencies } from './powersync/powersync-export-dependencies';
import { createPowerSyncDataPortabilityImportStore } from './powersync/powersync-import-store';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DataPortabilityModule');

export interface DataPortabilityModuleDependencies {
  readonly exportDependencies: DataPortabilityDependencies;
  readonly importStore: DataPortabilityImportStore;
  /** Owner-provided V3 capabilities registered without changing the V2 product route yet. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
  readonly runtimeContributions?:
    DataPortabilityModuleRuntimeContribution | readonly DataPortabilityModuleRuntimeContribution[];
}

export interface DataPortabilityModuleUseCases {
  readonly exportUserData: ExportUserDataUseCase;
  readonly importUserData: ImportUserDataUseCase;
}

export interface DataPortabilityModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export interface DataPortabilityModuleInstance {
  readonly exportDependencies: DataPortabilityDependencies;
  readonly importStore: DataPortabilityImportStore;
  readonly portableCapabilityRegistry: PortableCapabilityRegistry;
  readonly useCases: DataPortabilityModuleUseCases;
  readonly api: DataPortabilityApplicationPort;
  start(): void;
  dispose(): void;
}

export function createDataPortabilityUseCases(
  dependencies: DataPortabilityModuleDependencies,
): DataPortabilityModuleUseCases {
  return {
    exportUserData: new ExportUserDataUseCase(dependencies.exportDependencies),
    importUserData: new ImportUserDataUseCase(dependencies.importStore),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    DataPortabilityModuleRuntimeContribution | readonly DataPortabilityModuleRuntimeContribution[],
): readonly DataPortabilityModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as DataPortabilityModuleRuntimeContribution];
}

/**
 * Canonical data portability composition root.
 * 规范化的 data portability 模块组合根。
 */
export function createDataPortabilityModule(
  dependencies: DataPortabilityModuleDependencies,
): DataPortabilityModuleInstance {
  const useCases = createDataPortabilityUseCases(dependencies);
  const portableCapabilityRegistry = new PortableCapabilityRegistry();
  for (const capability of dependencies.portableCapabilities ?? []) {
    portableCapabilityRegistry.register(capability);
  }
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  let started = false;

  return {
    exportDependencies: dependencies.exportDependencies,
    importStore: dependencies.importStore,
    portableCapabilityRegistry,
    useCases,
    api: {
      exportUserData: (identityId, request) =>
        useCases.exportUserData.execute(identityId, request.include),
      importUserData: (identityId, request) =>
        useCases.importUserData.execute(identityId, request.content, request.dryRun ?? false),
    },
    start(): void {
      if (started) return;
      const startedContributions: DataPortabilityModuleRuntimeContribution[] = [];
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
                'DataPortabilityModule: contribution stop failed during partial-start rollback',
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

export function createPowerSyncDataPortabilityModule(
  db: IElectronDatabase,
  options: {
    readonly runtimeContributions?:
      | DataPortabilityModuleRuntimeContribution
      | readonly DataPortabilityModuleRuntimeContribution[];
  } = {},
): DataPortabilityModuleInstance {
  return createDataPortabilityModule({
    exportDependencies: createPowerSyncDataPortabilityDependencies(db),
    importStore: createPowerSyncDataPortabilityImportStore(db),
    runtimeContributions: options.runtimeContributions,
  });
}
