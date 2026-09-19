/**
 * Data Portability HTTP Adapter
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient, IDataPortabilityApiClient } from '../types';
import type {
  ExportServerHeldDataDisclosureReq,
  ExportServerHeldDataDisclosureRes,
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';

export class DataPortabilityHttpAdapter implements IDataPortabilityApiClient {
  private readonly baseUrl = '/data-portability';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async exportPortableDataV3(
    data: ExportPortableDataV3Req,
  ): Promise<Result<ExportPortableDataV3Res>> {
    return this.httpClient.post(`${this.baseUrl}/export`, data);
  }

  async exportServerHeldDataDisclosure(
    data: ExportServerHeldDataDisclosureReq,
  ): Promise<Result<ExportServerHeldDataDisclosureRes>> {
    return this.httpClient.post(`${this.baseUrl}/server-held-data-disclosure`, data);
  }

  async dryRunPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.httpClient.post(`${this.baseUrl}/dry-run`, data);
  }

  async applyPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.httpClient.post(`${this.baseUrl}/apply`, data);
  }
}

export function createDataPortabilityHttpAdapter(
  httpClient: IResultHttpClient,
): DataPortabilityHttpAdapter {
  return new DataPortabilityHttpAdapter(httpClient);
}
