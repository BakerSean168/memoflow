/**
 * Account client seam.
 *
 * Public account contracts stay centralized in `@memoflow/contracts/account`.
 * Callers depend on this seam instead of the old application-client /
 * infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import { createAccountClientService, type AccountClientPort } from '../application-client';
import {
  AccountHttpAdapter,
  createAccountHttpAdapters,
  type AccountHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  AccountIpcAdapter,
  createAccountIpcAdapters,
  type AccountIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type { IAccountApiClient, IResultIpcClient } from '../infrastructure-client/adapters/types';

export type {
  AccountClientPort,
  AccountHttpAdapters,
  AccountIpcAdapters,
  IAccountApiClient,
  IResultHttpClient,
  IResultIpcClient,
};

/**
 * Creates the account HTTP client seam.
 */
export function createAccountHttpClient(httpClient: IResultHttpClient): AccountClientPort {
  return createAccountClientService(new AccountHttpAdapter(httpClient));
}

/**
 * Creates the account IPC client seam.
 */
export function createAccountIpcClient(ipcClient: IResultIpcClient): AccountClientPort {
  return createAccountClientService(new AccountIpcAdapter(ipcClient));
}

export {
  AccountHttpAdapter,
  AccountIpcAdapter,
  createAccountHttpAdapters,
  createAccountIpcAdapters,
};
