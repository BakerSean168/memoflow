/**
 * Data Portability Application Client Layer
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type {
  ExportServerHeldDataDisclosureReq,
  ExportServerHeldDataDisclosureRes,
  ExportPortableDataV3Req,
  ExportPortableDataV3Res,
  PortableDataV3ImportReq,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';
import type { IDataPortabilityApiClient } from './ports/data-portability-api-client.port';
import { createDataPortabilityHttpAdapter } from '../infrastructure-client';

export type { IDataPortabilityApiClient } from './ports/data-portability-api-client.port';

/**
 * Application-facing client port.
 * Identical to IDataPortabilityApiClient for this module (no separate dual surface).
 */
export type DataPortabilityClientPort = IDataPortabilityApiClient;

export class DataPortabilityClientService implements IDataPortabilityApiClient {
  constructor(private readonly apiClient: IDataPortabilityApiClient) {
    this.exportPortableDataV3 = this.exportPortableDataV3.bind(this);
    this.exportServerHeldDataDisclosure = this.exportServerHeldDataDisclosure.bind(this);
    this.dryRunPortableDataV3 = this.dryRunPortableDataV3.bind(this);
    this.applyPortableDataV3 = this.applyPortableDataV3.bind(this);
  }

  exportPortableDataV3(
    data: ExportPortableDataV3Req,
  ): Promise<Result<ExportPortableDataV3Res>> {
    return this.apiClient.exportPortableDataV3(data);
  }

  exportServerHeldDataDisclosure(
    data: ExportServerHeldDataDisclosureReq,
  ): Promise<Result<ExportServerHeldDataDisclosureRes>> {
    return this.apiClient.exportServerHeldDataDisclosure(data);
  }

  dryRunPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.apiClient.dryRunPortableDataV3(data);
  }

  applyPortableDataV3(
    data: PortableDataV3ImportReq,
  ): Promise<Result<PortableDataV3ImportRes>> {
    return this.apiClient.applyPortableDataV3(data);
  }
}

export function createDataPortabilityClientService(
  apiClient: IDataPortabilityApiClient,
): DataPortabilityClientService {
  return new DataPortabilityClientService(apiClient);
}

export function createDataPortabilityServiceFromHttpClient(
  httpClient: IResultHttpClient,
): DataPortabilityClientService {
  const adapter = createDataPortabilityHttpAdapter(httpClient);
  return createDataPortabilityClientService(adapter);
}
