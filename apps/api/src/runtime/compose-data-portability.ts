/**
 * API-lane Data Portability composition root.
 *
 * The host supplies the owner-registered V3 capability set. Prisma is used
 * only for the separate server-held disclosure source; no persistence-shaped
 * portability repository or import store is assembled here.
 */

import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { PrismaClient } from '@memoflow/database';
import {
  createDataPortabilityModule,
  createPrismaServerHeldDataDisclosureApplicationPort,
  type ServerHeldDataDisclosureApplicationPort,
} from '@memoflow/data-portability';
import {
  createDataPortabilityApiModule,
  type DataPortabilityApiModuleDef,
} from '@memoflow/data-portability/api';

export interface ComposeDataPortabilityDependencies {
  /** Shared Prisma client used only by the disclosure-only export path. */
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
    portableCapabilities: dependencies.portableCapabilities,
    productVersion: dependencies.productVersion ?? '0.0.1',
  });

  return {
    module: createDataPortabilityApiModule({
      instance,
      serverHeldDataDisclosureApi,
    }),
    serverHeldDataDisclosureApi,
  };
}
