import type {
  CreateNotificationReq,
  CreateNotificationRes,
  NotificationQuery,
  NotificationListRes,
  MarkAsReadBatchReq,
  MarkAsReadBatchRes,
  DeleteNotificationsBatchReq,
  DeleteNotificationsBatchRes,
  CleanupOldNotificationsReq,
  CleanupOldNotificationsRes,
  GetNotificationStatsReq,
  GetNotificationStatsRes,
  ExecuteNotificationActionReq,
  ExecuteNotificationActionRes,
  UpdateNotificationPreferenceReq,
  UpdateNotificationPreferenceRes,
  GetNotificationPreferenceReq,
  GetNotificationPreferenceRes,
} from '../api';
import type {
  DeleteNotificationInvocation,
  MarkNotificationReadInvocation,
  MarkNotificationUnreadInvocation,
  ArchiveNotificationInvocation,
  RestoreNotificationInvocation,
  NotificationBatchInvocation,
  ReplayDeadLetterInvocation,
} from '../api/notification-invocation.schemas';
import type {
  NotificationBatchResult,
  NotificationResponse,
  UnreadCountResponse,
} from '../api/response-schemas';

// === Notification Module RPC Map ===
// Every map entry corresponds to a live transport surface.
export type NotificationRpcMap = {
  // === CRUD / status ===
  'notification:create': [CreateNotificationReq, CreateNotificationRes];
  'notification:delete': [DeleteNotificationInvocation, null];
  'notification:mark-read': [MarkNotificationReadInvocation, NotificationResponse];
  'notification:mark-unread': [MarkNotificationUnreadInvocation, NotificationResponse];
  'notification:archive': [ArchiveNotificationInvocation, NotificationResponse];
  'notification:restore': [RestoreNotificationInvocation, NotificationResponse];
  'notification:mark-all-read': [void, UnreadCountResponse];
  'notification:query': [NotificationQuery, NotificationListRes];

  // === Batch operations ===
  'notification:mark-as-read-batch': [MarkAsReadBatchReq, MarkAsReadBatchRes];
  'notification:delete-batch': [DeleteNotificationsBatchReq, DeleteNotificationsBatchRes];
  'notification:clear-all': [NotificationBatchInvocation, NotificationBatchResult];
  'notification:cleanup-old': [CleanupOldNotificationsReq, CleanupOldNotificationsRes];

  // === Statistics ===
  'notification:get-stats': [GetNotificationStatsReq, GetNotificationStatsRes];
  'notification:unread-count': [void, UnreadCountResponse];

  // === Dead-letter ===
  'notification:dead-letter-replay': [ReplayDeadLetterInvocation, NotificationResponse];

  // === Actions (protocol-only; no live transport) ===
  'notification:execute-action': [ExecuteNotificationActionReq, ExecuteNotificationActionRes];

  // === Preferences ===
  'notification-preference:update': [
    UpdateNotificationPreferenceReq,
    UpdateNotificationPreferenceRes,
  ];
  'notification-preference:get': [GetNotificationPreferenceReq, GetNotificationPreferenceRes];
};
