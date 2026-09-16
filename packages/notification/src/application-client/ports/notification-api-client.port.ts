/**
 * Notification API Client Port
 *
 * Transport-agnostic interface for Notification API operations.
 * Implementations: HTTP adapters (web), IPC adapters (desktop)
 *
 * Types imported from @memoflow/contracts/notification.
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  BatchOperationResultDTO,
  NotificationClientDTO,
  NotificationPreferenceClientDTO,
  UnreadCountResponse,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';

// ============ Local Request/Response Types ============

export interface CreateNotificationRequest {
  type: string;
  title: string;
  content?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryNotificationsRequest {
  page?: number;
  limit?: number;
  type?: string;
  isRead?: boolean;
  archiveState?: 'active' | 'archived' | 'all';
  workflowKey?: string;
  topic?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}

export interface NotificationListResponse {
  notifications: NotificationClientDTO[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Residual 801: UnreadCountResponse dual retired — contracts UnreadCountResponseSchema + z.infer.
export type { UnreadCountResponse };

// ============ Port Interface ============

/**
 * INotificationApiClient
 *
 * 通知模块 API 客户端接口
 */
export interface INotificationApiClient {
  createNotification(request: CreateNotificationRequest): Promise<Result<NotificationClientDTO>>;
  findNotifications(query?: QueryNotificationsRequest): Promise<Result<NotificationListResponse>>;
  findNotificationById(id: string): Promise<Result<NotificationClientDTO>>;
  markAsRead(id: string): Promise<Result<NotificationClientDTO>>;
  markAsUnread(id: string): Promise<Result<NotificationClientDTO>>;
  archiveNotification(id: string): Promise<Result<NotificationClientDTO>>;
  restoreNotification(id: string): Promise<Result<NotificationClientDTO>>;
  markAllAsRead(): Promise<Result<{ count: number }>>;
  deleteNotification(id: string): Promise<Result<null>>;
  batchDeleteNotifications(ids: string[]): Promise<Result<BatchOperationResultDTO>>;
  getUnreadCount(): Promise<Result<UnreadCountResponse>>;
  /** Residual 197: identity comes from transport auth, not client body dual-track. */
  getPreferences(): Promise<Result<NotificationPreferenceClientDTO>>;
  updatePreferences(
    request: UpdateNotificationPreferenceReq,
  ): Promise<Result<NotificationPreferenceClientDTO>>;
}
