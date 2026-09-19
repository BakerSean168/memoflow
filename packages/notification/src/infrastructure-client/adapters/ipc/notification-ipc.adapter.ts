/**
 * Notification IPC Adapter
 *
 * IPC implementation of INotificationApiClient for Electron desktop apps.
 */

import type { Result } from '@memoflow/contracts/result';
import { NotificationChannels } from '@memoflow/contracts/electron';
import type {
  IResultIpcClient,
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

export class NotificationIpcAdapter implements INotificationApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async createNotification(request: CreateNotificationRequest): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.CREATE, request);
  }

  async findNotifications(query?: QueryNotificationsRequest): Promise<Result<NotificationListResponse>> {
    return this.ipcClient.invoke(NotificationChannels.LIST, query);
  }

  async findNotificationById(id: string): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.GET, id);
  }

  async markAsRead(id: string): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.MARK_READ, id);
  }

  async markAsUnread(id: string): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.MARK_UNREAD, id);
  }

  async archiveNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.ARCHIVE, id);
  }

  async restoreNotification(id: string): Promise<Result<NotificationClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.RESTORE, id);
  }

  async markAllAsRead(): Promise<Result<{ count: number }>> {
    return this.ipcClient.invoke(NotificationChannels.MARK_ALL_READ);
  }

  async deleteNotification(id: string): Promise<Result<null>> {
    return this.ipcClient.invoke(NotificationChannels.DELETE, id);
  }

  async batchDeleteNotifications(ids: string[]): Promise<Result<BatchOperationResultDTO>> {
    return this.ipcClient.invoke(NotificationChannels.CLEAR_ALL, ids);
  }

  async getUnreadCount(): Promise<Result<UnreadCountResponse>> {
    return this.ipcClient.invoke(NotificationChannels.GET_UNREAD_COUNT);
  }

  async getPreferences(): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.PREFERENCES_GET);
  }

  async updatePreferences(
    request: UpdateNotificationPreferenceReq,
  ): Promise<Result<NotificationPreferenceClientDTO>> {
    return this.ipcClient.invoke(NotificationChannels.PREFERENCES_UPDATE, request);
  }
}

export function createNotificationIpcAdapter(ipcClient: IResultIpcClient): NotificationIpcAdapter {
  return new NotificationIpcAdapter(ipcClient);
}
