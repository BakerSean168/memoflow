import type { Result } from '@memoflow/contracts/result';
import type {
  DeleteNotificationsBatchReq,
  ExecuteNotificationActionRes,
  MarkAsReadBatchReq,
  NotificationDispatchDesktopEvent,
  NotificationDispatchInAppEvent,
} from '@memoflow/contracts/notification';

export type NotificationSseDeliveryEvent =
  | NotificationDispatchInAppEvent
  | NotificationDispatchDesktopEvent;

/** Product-facing Notification seam. Operational diagnostics are deliberately absent. */
export interface NotificationInboxPort {
  createNotification(data: unknown): Promise<Result<unknown>>;
  listNotifications(query: unknown): Promise<Result<unknown>>;
  getNotification(id: string, identityId: string): Promise<Result<unknown>>;
  deleteNotification(id: string, identityId: string): Promise<Result<unknown>>;
  markAsRead(id: string, identityId: string): Promise<Result<unknown>>;
  markAsUnread(id: string, identityId: string): Promise<Result<unknown>>;
  archive(id: string, identityId: string): Promise<Result<unknown>>;
  restore(id: string, identityId: string): Promise<Result<unknown>>;
  markAllAsRead(identityId: string): Promise<Result<unknown>>;
  getUnreadCount(identityId: string): Promise<Result<unknown>>;
  batchMarkAsRead(data: MarkAsReadBatchReq, identityId: string): Promise<Result<unknown>>;
  batchDelete(data: DeleteNotificationsBatchReq, identityId: string): Promise<Result<unknown>>;
  cleanupOldNotifications(data: {
    identityId: string;
    beforeDays?: number;
    category?: string;
  }): Promise<Result<unknown>>;
  getPreferences(identityId: string): Promise<Result<unknown>>;
  updatePreferences(dto: unknown, identityId: string): Promise<Result<unknown>>;
  executeAction(
    notificationId: string,
    actionKey: string,
    identityId: string,
  ): Promise<Result<ExecuteNotificationActionRes>>;
  subscribeSseEvents(handler: (payload: NotificationSseDeliveryEvent) => void): () => void;
}
