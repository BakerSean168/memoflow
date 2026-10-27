/**
 * Data portability client seam.
 *
 * Public data portability contracts stay centralized in
 * `@memoflow/data-portability-contracts`.
 * Callers depend on this seam instead of the old
 * application-client / infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import {
  createDataPortabilityClientService,
  type DataPortabilityClientPort,
} from '../application-client';
import { DataPortabilityHttpAdapter } from '../infrastructure-client/adapters/http/data-portability-http.adapter';
import { DataPortabilityIpcAdapter } from '../infrastructure-client/adapters/ipc/data-portability-ipc.adapter';
import type {
  IDataPortabilityApiClient,
  IResultIpcClient,
} from '../infrastructure-client/adapters/types';

export type {
  DataPortabilityClientPort,
  IDataPortabilityApiClient,
  IResultHttpClient,
  IResultIpcClient,
};

/**
 * Creates the data portability HTTP client seam.
 */
export function createDataPortabilityHttpClient(
  httpClient: IResultHttpClient,
): DataPortabilityClientPort {
  return createDataPortabilityClientService(new DataPortabilityHttpAdapter(httpClient));
}

/**
 * Creates the data portability IPC client seam.
 */
export function createDataPortabilityIpcClient(
  ipcClient: IResultIpcClient,
): DataPortabilityClientPort {
  return createDataPortabilityClientService(new DataPortabilityIpcAdapter(ipcClient));
}

export { DataPortabilityHttpAdapter, DataPortabilityIpcAdapter };
