/**
 * Notification Module - Infrastructure Client
 *
 * Adapters for Notification module communication.
 */

// Port Interfaces
export type {
  INotificationApiClient,
  CreateNotificationRequest,
  QueryNotificationsRequest,
  NotificationListResponse,
  UnreadCountResponse,
  IResultIpcClient,
} from './adapters/types';

// HTTP Adapters
export {
  NotificationHttpAdapter,
  createNotificationHttpAdapters,
  type NotificationHttpAdapters,
} from './adapters/http';

// IPC Adapters
export {
  NotificationIpcAdapter,
  createNotificationIpcAdapters,
  type NotificationIpcAdapters,
} from './adapters/ipc';
