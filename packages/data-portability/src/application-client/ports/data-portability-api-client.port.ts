/**
 * Data Portability API Client Port
 *
 * Transport-agnostic interface for the V3 product surface and server-held disclosure.
 * Implementations: HTTP adapters (web), IPC adapters (desktop).
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  ExportServerHeldDataDisclosureReq,
  ExportServerHeldDataDisclosureRes,
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';

export interface IDataPortabilityApiClient {
  exportPortableDataV3(data: ExportPortableDataV3Req): Promise<Result<ExportPortableDataV3Res>>;
  exportServerHeldDataDisclosure(
    data: ExportServerHeldDataDisclosureReq,
  ): Promise<Result<ExportServerHeldDataDisclosureRes>>;
  dryRunPortableDataV3(data: PortableDataV3ImportReq): Promise<Result<PortableDataV3ImportRes>>;
  applyPortableDataV3(data: PortableDataV3ImportReq): Promise<Result<PortableDataV3ImportRes>>;
}
