/**
 * Setting client seam.
 *
 * Public setting contracts stay centralized in `@memoflow/setting-contracts`.
 * Callers depend on this seam instead of the retired in-package
 * application-client / infrastructure-client layering. The seam exports the
 * port type and the HTTP/IPC adapter factories; there is no client-side
 * aggregate mirror — the port returns contracts DTOs directly (goal-client
 * G-2 / notification-client precedent).
 *
 * 设置客户端 seam：只导出端口类型与 HTTP/IPC 适配器工厂，不再有客户端聚合镜像。
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import type { ISettingApiClient } from './application-client/ports/setting-api-client.port';
import type { SettingClientPort } from './application-client';
import {
  SettingHttpAdapter,
  createSettingHttpAdapters,
  type SettingHttpAdapters,
} from './infrastructure-client/adapters/http';
import {
  SettingIpcAdapter,
  createSettingIpcAdapters,
  type SettingIpcAdapters,
} from './infrastructure-client/adapters/ipc';

export type {
  IResultHttpClient,
  IResultIpcClient,
  ISettingApiClient,
  SettingClientPort,
  SettingHttpAdapters,
  SettingIpcAdapters,
};

/** Creates the setting HTTP client seam. */
export function createSettingHttpClient(httpClient: IResultHttpClient): SettingClientPort {
  return new SettingHttpAdapter(httpClient);
}

/** Creates the setting IPC client seam. */
export function createSettingIpcClient(ipcClient: IResultIpcClient): SettingClientPort {
  return new SettingIpcAdapter(ipcClient);
}

export {
  SettingHttpAdapter,
  SettingIpcAdapter,
  createSettingHttpAdapters,
  createSettingIpcAdapters,
};
export { createSettingServiceFromHttpClient } from './application-client';
