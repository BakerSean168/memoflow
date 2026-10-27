import type { NotificationServerDTO } from '../aggregates/notification-server';
import type { NotificationCategory, NotificationType } from '../value-objects';

export interface NotificationListResultDTO {
  notifications: NotificationServerDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface NotificationStatsDTO {
  unreadCount: number;
  totalCount: number;
  byCategory: Record<NotificationCategory, number>;
  byType: Record<NotificationType, number>;
  readState: { read: number; unread: number };
}
