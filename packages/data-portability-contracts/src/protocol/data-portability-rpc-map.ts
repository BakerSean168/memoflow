/**
 * Data Portability RPC Map — transport request/response pairs
 *
 * Keys are the canonical desktop IPC channel literals owned by
 * `@memoflow/desktop-contracts` (`DataPortabilityChannels`), stated here as
 * literals on purpose: the contract layer must not import the desktop contract
 * package, which now depends on this package for the profile-import wrapper
 * schemas (#630 §4.11). The edge therefore stays one-way
 * (desktop-contracts → data-portability-contracts).
 */

import type {
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '../api/portable-v3.dto';

export type DataPortabilityRpcMap = {
  'data-portability:export': [ExportPortableDataV3Req, ExportPortableDataV3Res];
  'data-portability:dry-run': [PortableDataV3ImportReq, PortableDataV3ImportRes];
  'data-portability:apply': [PortableDataV3ImportReq, PortableDataV3ImportRes];
};
