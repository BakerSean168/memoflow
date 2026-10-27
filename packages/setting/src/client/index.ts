/**
 * Setting client seam.
 *
 * Public setting contracts stay centralized in `@memoflow/setting-contracts`.
 * Callers depend on this seam instead of the old application-client /
 * infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import { createSettingClientService, type SettingClientPort } from '../application-client';
import {
  SettingHttpAdapter,
  createSettingHttpAdapters,
  type SettingHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  SettingIpcAdapter,
  createSettingIpcAdapters,
  type SettingIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import type { ISettingApiClient } from '../application-client/ports/setting-api-client.port';

export type {
  IResultHttpClient,
  IResultIpcClient,
  ISettingApiClient,
  SettingClientPort,
  SettingHttpAdapters,
  SettingIpcAdapters,
};

/**
 * Creates the setting HTTP client seam.
 */
export function createSettingHttpClient(httpClient: IResultHttpClient): SettingClientPort {
  return createSettingClientService(new SettingHttpAdapter(httpClient));
}

/**
 * Creates the setting IPC client seam.
 */
export function createSettingIpcClient(ipcClient: IResultIpcClient): SettingClientPort {
  return createSettingClientService(new SettingIpcAdapter(ipcClient));
}

export {
  SettingHttpAdapter,
  SettingIpcAdapter,
  createSettingHttpAdapters,
  createSettingIpcAdapters,
};
