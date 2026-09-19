import type {
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';

/**
 * Transport-neutral data portability application surface.
 */
export interface DataPortabilityApplicationPort {
  exportPortableDataV3(
    identityId: string,
    request: ExportPortableDataV3Req,
  ): Promise<ExportPortableDataV3Res>;
  dryRunPortableDataV3(
    identityId: string,
    request: PortableDataV3ImportReq,
  ): Promise<PortableDataV3ImportRes>;
  applyPortableDataV3(
    identityId: string,
    request: PortableDataV3ImportReq,
  ): Promise<PortableDataV3ImportRes>;
}
