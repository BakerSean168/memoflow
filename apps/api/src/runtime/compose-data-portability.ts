import { composeProfileImportCapabilities } from './compose-profile-import-capabilities';
import { composeBusinessDataSummary } from './compose-business-data-summary';
/**
 * API-lane Data Portability composition root.
 *
 * The host supplies the owner-registered V3 capability set. Prisma is used
 * for server-held disclosure and the durable, transaction-scoped Profile import
 * operation. Business writes remain in owner-provided capabilities.
 */

import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { PrismaClient } from '@memoflow/database';
import {
  createDataPortabilityModule,
  createPrismaProfileImportService,
  createProfileImportScheduleRecovery,
  createPrismaServerHeldDataDisclosureApplicationPort,
  type ServerHeldDataDisclosureApplicationPort,
} from '@memoflow/data-portability';
import {
  createDataPortabilityApiModule,
  type DataPortabilityApiModuleDef,
} from '@memoflow/data-portability/api';

export interface ComposeDataPortabilityDependencies {
  readonly reconcileImportedProfile?: (identityId: string) => Promise<boolean>;
  /** Shared Prisma client for disclosure, Profile import transactions and recovery. */
  readonly db: PrismaClient;
  /** Complete owner-provided V3 capability registry input. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
  readonly productVersion?: string;
}

export interface ComposedDataPortability {
  readonly module: DataPortabilityApiModuleDef;
  readonly serverHeldDataDisclosureApi: ServerHeldDataDisclosureApplicationPort;
}

export function composeDataPortability(
  dependencies: ComposeDataPortabilityDependencies,
): ComposedDataPortability {
  const serverHeldDataDisclosureApi = createPrismaServerHeldDataDisclosureApplicationPort(
    dependencies.db,
  );
  const instance = createDataPortabilityModule({
    runtimeContributions: dependencies.reconcileImportedProfile
      ? createProfileImportScheduleRecovery(dependencies.db, dependencies.reconcileImportedProfile)
      : undefined,
    portableCapabilities: dependencies.portableCapabilities,
    productVersion: dependencies.productVersion ?? '0.0.1',
  });

  return {
    module: createDataPortabilityApiModule({
      instance,
      profileImport: createPrismaProfileImportService(dependencies.db, {
        capabilities: composeProfileImportCapabilities,
        readSummary: (tx, identityId) => composeBusinessDataSummary(tx)(identityId),
      }),
      serverHeldDataDisclosureApi,
    }),
    serverHeldDataDisclosureApi,
  };
}
