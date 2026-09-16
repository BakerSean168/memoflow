/**
 * Notification Client Service
 *
 * Constructor-injected application service for notification management.
 * Uses port interfaces directly, returning Result<T> types throughout.
 *
 * @module application-client/notification-client-service
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  BatchOperationResultDTO,
  NotificationClientDTO,
  NotificationPreferenceClientDTO,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';
import type {
  INotificationApiClient,
  CreateNotificationRequest,
  QueryNotificationsRequest,
  NotificationListResponse,
  UnreadCountResponse,
} from './ports/notification-api-client.port';

// ─── Client Application Port ────────────────────────────────────────────────

/**
 * Application-facing client port.
 * Identical to INotificationApiClient for this module (pure Result pass-through;
 * dismissAll dual removed — callers use batchDeleteNotifications).
 */
export type NotificationClientPort = INotificationApiClient;

export class NotificationClientService implements INotificationApiClient {
  constructor(private readonly notificationApi: INotificationApiClient) {
    this.createNotification = this.createNotification.bind(this);
    this.findNotifications = this.findNotifications.bind(this);
    this.findNotificationById = this.findNotificationById.bind(this);
    this.markAsRead = this.markAsRead.bind(this);
    this.markAsUnread = this.markAsUnread.bind(this);
    this.archiveNotification = this.archiveNotification.bind(this);
    this.restoreNotification = this.restoreNotification.bind(this);
    this.markAllAsRead = this.markAllAsRead.bind(this);
    this.deleteNotification = this.deleteNotification.bind(this);
    this.batchDeleteNotifications = this.batchDeleteNotifications.bind(this);
    this.getUnreadCount = this.getUnreadCount.bind(this);
    this.getPreferences = this.getPreferences.bind(this);
    this.updatePreferences = this.updatePreferences.bind(this);
  }

  // ===== Notification Operations =====

  async createNotification(
    request: CreateNotificationRequest,
  ): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.createNotification(request);
  }

  async findNotifications(
    query?: QueryNotificationsRequest,
  ): Promise<Result<NotificationListResponse>> {
    return this.notificationApi.findNotifications(query);
  }

  async findNotificationById(id: string): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.findNotificationById(id);
  }

  async markAsRead(id: string): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.markAsRead(id);
  }

  async markAsUnread(id: string): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.markAsUnread(id);
  }

  async archiveNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.archiveNotification(id);
  }

  async restoreNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.notificationApi.restoreNotification(id);
  }

  async markAllAsRead(): Promise<Result<{ count: number }>> {
    return this.notificationApi.markAllAsRead();
  }

  async deleteNotification(id: string): Promise<Result<null>> {
    return this.notificationApi.deleteNotification(id);
  }

  async batchDeleteNotifications(ids: string[]): Promise<Result<BatchOperationResultDTO>> {
    return this.notificationApi.batchDeleteNotifications(ids);
  }

  async getUnreadCount(): Promise<Result<UnreadCountResponse>> {
    return this.notificationApi.getUnreadCount();
  }

  async getPreferences(): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.notificationApi.getPreferences();
  }

  async updatePreferences(
    request: UpdateNotificationPreferenceReq,
  ): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.notificationApi.updatePreferences(request);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create a `NotificationClientService` from any transport adapter. */
export function createNotificationClientService(
  apiClient: INotificationApiClient,
): NotificationClientService {
  return new NotificationClientService(apiClient);
}
