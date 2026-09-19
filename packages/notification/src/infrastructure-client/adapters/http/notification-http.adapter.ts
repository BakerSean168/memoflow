/**
 * Notification HTTP Adapter
 *
 * HTTP implementation of INotificationApiClient.
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type {
  INotificationApiClient,
  CreateNotificationRequest,
  QueryNotificationsRequest,
  NotificationListResponse,
  UnreadCountResponse,
} from '../types';
import type {
  BatchOperationResultDTO,
  NotificationClientDTO,
  NotificationPreferenceClientDTO,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';
import { toNotificationQueryParams } from './notification-http.mapper';

/**
 * NotificationHttpAdapter
 *
 * HTTP 实现的通知 API 客户端
 */
export class NotificationHttpAdapter implements INotificationApiClient {
  private readonly baseUrl = '/notifications';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async createNotification(
    request: CreateNotificationRequest,
  ): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.post(this.baseUrl, request);
  }

  async findNotifications(
    query?: QueryNotificationsRequest,
  ): Promise<Result<NotificationListResponse>> {
    return this.httpClient.get(this.baseUrl, {
      params: query ? toNotificationQueryParams(query) : undefined,
    });
  }

  async findNotificationById(id: string): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}`);
  }

  async markAsRead(id: string): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.patch(`${this.baseUrl}/${id}/read`);
  }

  async markAsUnread(id: string): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/unread`);
  }

  async archiveNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/archive`);
  }

  async restoreNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/restore`);
  }

  async markAllAsRead(): Promise<Result<{ count: number }>> {
    return this.httpClient.patch(`${this.baseUrl}/read-all`);
  }

  async deleteNotification(id: string): Promise<Result<null>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`);
  }

  async batchDeleteNotifications(ids: string[]): Promise<Result<BatchOperationResultDTO>> {
    return this.httpClient.post(`${this.baseUrl}/batch-delete`, { notificationIds: ids });
  }

  async getUnreadCount(): Promise<Result<UnreadCountResponse>> {
    return this.httpClient.get(`${this.baseUrl}/unread-count`);
  }

  async getPreferences(): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/preferences`);
  }

  async updatePreferences(
    request: UpdateNotificationPreferenceReq,
  ): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.httpClient.put(`${this.baseUrl}/preferences`, request);
  }
}

/**
 * Factory function to create NotificationHttpAdapter
 */
export function createNotificationHttpAdapter(
  httpClient: IResultHttpClient,
): NotificationHttpAdapter {
  return new NotificationHttpAdapter(httpClient);
}
