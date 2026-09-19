/**
 * Desktop-lane Data Portability composition root.
 *
 * The desktop host supplies the same owner-registered V3 capability set as the
 * API host. Data Portability does not construct PowerSync repositories or an
 * import store; owner capabilities retain their own desktop persistence seams.
 */

import type { PortableCapability } from '@memoflow/contracts/data-portability';
import {
  createDataPortabilityModule,
} from '@memoflow/data-portability';
import {
  createDataPortabilityElectronModule,
  type DataPortabilityElectronModuleDef,
} from '@memoflow/data-portability/electron';

export interface ComposeDataPortabilityDesktopDependencies {
  /** Complete owner-provided V3 capability registry input. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
  readonly productVersion?: string;
}

export function composeDataPortability(
  dependencies: ComposeDataPortabilityDesktopDependencies,
): DataPortabilityElectronModuleDef {
  const instance = createDataPortabilityModule({
    portableCapabilities: dependencies.portableCapabilities,
    productVersion: dependencies.productVersion ?? '0.14.1',
  });
  return createDataPortabilityElectronModule({ instance });
}
