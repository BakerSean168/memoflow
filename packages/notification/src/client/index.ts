/**
 * Notification client seam.
 *
 * Public notification contracts stay centralized in
 * `@memoflow/contracts/notification`.
 * Callers depend on this seam instead of the old application-client /
 * infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import {
  createNotificationClientService,
  type NotificationClientPort,
} from '../application-client';
import {
  NotificationHttpAdapter,
  createNotificationHttpAdapters,
  type NotificationHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  NotificationIpcAdapter,
  createNotificationIpcAdapters,
  type NotificationIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type {
  CreateNotificationRequest,
  INotificationApiClient,
  IResultIpcClient,
  NotificationListResponse,
  UnreadCountResponse,
} from '../infrastructure-client/adapters/types';

export type {
  CreateNotificationRequest,
  INotificationApiClient,
  IResultHttpClient,
  IResultIpcClient,
  NotificationClientPort,
  NotificationHttpAdapters,
  NotificationIpcAdapters,
  NotificationListResponse,
  UnreadCountResponse,
};

export function createNotificationHttpClient(
  httpClient: IResultHttpClient,
): NotificationClientPort {
  return createNotificationClientService(new NotificationHttpAdapter(httpClient));
}

export function createNotificationIpcClient(ipcClient: IResultIpcClient): NotificationClientPort {
  return createNotificationClientService(new NotificationIpcAdapter(ipcClient));
}

export {
  NotificationHttpAdapter,
  NotificationIpcAdapter,
  createNotificationClientService,
  createNotificationHttpAdapters,
  createNotificationIpcAdapters,
};
