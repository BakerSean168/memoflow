import type {
  PortableCapability,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';
import { ResultCode, ResultErrorException } from '@memoflow/contracts/result';
import type { DataPortabilityApplicationPort } from '../application';
import { PortableCapabilityCoordinator } from '../application/portable-capability-coordinator';
import type { PortableImportReceiptV3 } from '../application/portable-capability-coordinator';
import { PortableCapabilityRegistry } from '../application/portable-capability';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DataPortabilityModule');

export interface DataPortabilityModuleDependencies {
  /** Owner-provided V3 capabilities registered in the production registry. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
  /** Version stamped into the orchestration envelope. */
  readonly productVersion?: string;
  readonly nowIsoString?: () => string;
  readonly createBatchId?: () => string;
  readonly runtimeContributions?:
    | DataPortabilityModuleRuntimeContribution
    | readonly DataPortabilityModuleRuntimeContribution[];
}

export interface DataPortabilityModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export interface DataPortabilityModuleUseCases {
  readonly portableCapabilityCoordinator: PortableCapabilityCoordinator;
}

export interface DataPortabilityModuleInstance {
  readonly portableCapabilityRegistry: PortableCapabilityRegistry;
  readonly portableCapabilityCoordinator: PortableCapabilityCoordinator;
  readonly useCases: DataPortabilityModuleUseCases;
  readonly api: DataPortabilityApplicationPort;
  start(): void;
  dispose(): void;
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    | DataPortabilityModuleRuntimeContribution
    | readonly DataPortabilityModuleRuntimeContribution[],
): readonly DataPortabilityModuleRuntimeContribution[] {
  if (!runtimeContributions) return [];
  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as DataPortabilityModuleRuntimeContribution];
}

function toPortableValidationError(error: unknown): ResultErrorException {
  if (error instanceof ResultErrorException) return error;
  const message = error instanceof Error ? error.message : 'Portable V3 operation failed';
  return new ResultErrorException(message, ResultCode.VALIDATION_ERROR, undefined, undefined, 400);
}

function createDefaultBatchId(): string {
  return `portable-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Canonical V3-only data portability composition root.
 *
 * Data Portability owns orchestration and transport-neutral lifecycle only.
 * Owner capabilities own all portable payload semantics and persistence.
 */
export function createDataPortabilityModule(
  dependencies: DataPortabilityModuleDependencies,
): DataPortabilityModuleInstance {
  const portableCapabilityRegistry = new PortableCapabilityRegistry();
  for (const capability of dependencies.portableCapabilities ?? []) {
    portableCapabilityRegistry.register(capability);
  }

  const portableCapabilityCoordinator = new PortableCapabilityCoordinator(
    portableCapabilityRegistry,
    {
      productVersion: dependencies.productVersion ?? 'unknown',
      nowIsoString: dependencies.nowIsoString ?? (() => new Date().toISOString()),
      createBatchId: dependencies.createBatchId ?? createDefaultBatchId,
    },
  );
  const useCases = { portableCapabilityCoordinator };
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  let started = false;

  const api: DataPortabilityApplicationPort = {
    async exportPortableDataV3(identityId, request) {
      try {
        const result = await portableCapabilityCoordinator.export(identityId, request.capabilities);
        const exportedAt = result.envelope.exportedAt;
        const timestamp = exportedAt.replace(/[:.]/g, '-').slice(0, 19);
        return {
          fileName: `memoflow-user-data-v3-${timestamp}.json`,
          content: JSON.stringify(result.envelope, null, 2),
          summary: { capabilityKeys: [...result.capabilityKeys], warnings: [] },
        };
      } catch (error) {
        throw toPortableValidationError(error);
      }
    },
    async dryRunPortableDataV3(identityId, request) {
      try {
        return toTransportReceipt(
          await portableCapabilityCoordinator.dryRun(request.content, identityId),
        );
      } catch (error) {
        throw toPortableValidationError(error);
      }
    },
    async applyPortableDataV3(identityId, request) {
      try {
        return toTransportReceipt(
          await portableCapabilityCoordinator.apply(request.content, identityId),
        );
      } catch (error) {
        throw toPortableValidationError(error);
      }
    },
  };

  return {
    portableCapabilityRegistry,
    portableCapabilityCoordinator,
    useCases,
    api,
    start(): void {
      if (started) return;
      const startedContributions: DataPortabilityModuleRuntimeContribution[] = [];
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
      for (const runtime of [...runtimeContributions].reverse()) runtime.stop();
      started = false;
    },
  };
}

function toTransportReceipt(receipt: PortableImportReceiptV3): PortableDataV3ImportRes {
  return {
    batchId: receipt.batchId,
    dryRun: receipt.dryRun,
    capabilities: receipt.capabilities.map((entry) => ({
      key: entry.key,
      schemaVersion: entry.schemaVersion,
      created: entry.created,
      updated: entry.updated,
      skipped: entry.skipped,
      warnings: [...entry.warnings],
    })),
    created: { ...receipt.created },
    updated: { ...receipt.updated },
    skipped: { ...receipt.skipped },
    warnings: [...receipt.warnings],
  };
}
