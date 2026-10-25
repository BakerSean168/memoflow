/**
 * Repository client seam.
 *
 * Public repository contracts stay centralized in
 * `@memoflow/contracts/repository`.
 * Callers depend on this seam instead of the old application-client /
 * infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import { createRepositoryClientService, type RepositoryClientPort } from '../application-client';
import {
  RepositoryHttpAdapter,
  createRepositoryHttpAdapters,
  type RepositoryHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  RepositoryIpcAdapter,
  createRepositoryIpcAdapters,
  type RepositoryIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type {
  IRepositoryApiClient,
  IResultIpcClient,
} from '../infrastructure-client/adapters/types';

export type {
  RepositoryClientPort,
  RepositoryHttpAdapters,
  RepositoryIpcAdapters,
  IRepositoryApiClient,
  IResultHttpClient,
  IResultIpcClient,
};

export function createRepositoryHttpClient(httpClient: IResultHttpClient): RepositoryClientPort {
  return createRepositoryClientService(new RepositoryHttpAdapter(httpClient));
}

export function createRepositoryIpcClient(ipcClient: IResultIpcClient): RepositoryClientPort {
  return createRepositoryClientService(new RepositoryIpcAdapter(ipcClient));
}

export {
  RepositoryHttpAdapter,
  RepositoryIpcAdapter,
  createRepositoryHttpAdapters,
  createRepositoryIpcAdapters,
};
