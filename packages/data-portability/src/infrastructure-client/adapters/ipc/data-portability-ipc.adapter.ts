/**
 * Data Portability — IPC Adapter (renderer side)
 *
 * Implements IDataPortabilityApiClient via Electron IPC.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail } from '@memoflow/contracts/result';
import { DataPortabilityChannels } from '@memoflow/contracts/electron';
import type { IResultIpcClient, IDataPortabilityApiClient } from '../types';
import type {
  ExportServerHeldDataDisclosureReq,
  ExportServerHeldDataDisclosureRes,
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';

export class DataPortabilityIpcAdapter implements IDataPortabilityApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async exportPortableDataV3(
    data: ExportPortableDataV3Req,
  ): Promise<Result<ExportPortableDataV3Res>> {
    return this.ipcClient.invoke(DataPortabilityChannels.EXPORT, data);
  }

  async exportServerHeldDataDisclosure(
    _data: ExportServerHeldDataDisclosureReq,
  ): Promise<Result<ExportServerHeldDataDisclosureRes>> {
    return fail({
      code: 'NOT_SUPPORTED',
      message: 'Server-held data disclosure is available from the authenticated Web runtime',
    });
  }

  async dryRunPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.ipcClient.invoke(DataPortabilityChannels.DRY_RUN, data);
  }

  async applyPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.ipcClient.invoke(DataPortabilityChannels.APPLY, data);
  }
}
