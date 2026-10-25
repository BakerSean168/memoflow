/**
 * Notification IPC Adapters - Registration
 */

import type { IResultIpcClient } from '../types';
import { NotificationIpcAdapter } from './notification-ipc.adapter';

export { NotificationIpcAdapter, createNotificationIpcAdapter } from './notification-ipc.adapter';

export interface NotificationIpcAdapters {
  notification: NotificationIpcAdapter;
}

export function createNotificationIpcAdapters(
  ipcClient: IResultIpcClient,
): NotificationIpcAdapters {
  return { notification: new NotificationIpcAdapter(ipcClient) };
}
