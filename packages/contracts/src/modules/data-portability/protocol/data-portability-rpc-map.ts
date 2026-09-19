/**
 * Data Portability RPC Map — transport request/response pairs
 */

import { DataPortabilityChannels } from '../../../electron/ipc-channels';
import type {
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '../api/portable-v3.dto';

export type DataPortabilityRpcMap = {
  [DataPortabilityChannels.EXPORT]: [ExportPortableDataV3Req, ExportPortableDataV3Res];
  [DataPortabilityChannels.DRY_RUN]: [PortableDataV3ImportReq, PortableDataV3ImportRes];
  [DataPortabilityChannels.APPLY]: [PortableDataV3ImportReq, PortableDataV3ImportRes];
};
