import type { Result } from '@memoflow/contracts/result';
import type {
  DeleteNotificationsBatchReq,
  MarkAsReadBatchReq,
  NotificationDispatchDesktopEvent,
  NotificationDispatchInAppEvent,
} from '@memoflow/contracts/notification';

export type NotificationSseDeliveryEvent =
  | NotificationDispatchInAppEvent
  | NotificationDispatchDesktopEvent;

export interface NotificationApplicationPort {
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
  batchMarkAsRead(
    data: MarkAsReadBatchReq,
    identityId: string,
  ): Promise<Result<unknown>>;
  batchDelete(
    data: DeleteNotificationsBatchReq,
    identityId: string,
  ): Promise<Result<unknown>>;
  cleanupOldNotifications(data: {
    identityId: string;
    beforeDays?: number;
    category?: string;
  }): Promise<Result<unknown>>;
  getPreferences(identityId: string): Promise<Result<unknown>>;
  updatePreferences(dto: unknown, identityId: string): Promise<Result<unknown>>;
  queryDeadLetters(identityId: string): Promise<Result<unknown>>;
  replayDeadLetter(operationId: string, identityId: string): Promise<Result<unknown>>;
  getDeliveryReceipts(
    identityId: string,
    query?: { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<Result<unknown>>;
  getOperationTimeline(
    identityId: string,
    query?: { status?: string; limit?: number },
  ): Promise<Result<unknown>>;
  getOperationAudit(
    identityId: string,
    query?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<unknown>>;
  /**
   * Subscribe to real-time delivery events via the SSE port.
   * Returns an unsubscribe function to be called when the transport connection closes.
   */
  subscribeSseEvents(handler: (payload: NotificationSseDeliveryEvent) => void): () => void;
}
