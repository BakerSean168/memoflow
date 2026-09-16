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
  SendNotificationReq,
  SendNotificationRes,
  RetryChannelReq,
  RetryChannelRes,
  ListNotificationChannelsReq,
  ListNotificationChannelsRes,
} from '../api';
import type {
  DeleteNotificationInvocation,
  MarkNotificationReadInvocation,
  NotificationBatchInvocation,
  ReplayDeadLetterInvocation,
} from '../api/notification-invocation.schemas';
import type {
  NotificationBatchResult,
  NotificationResponse,
  UnreadCountResponse,
} from '../api/response-schemas';

// === Notification Module RPC Map ===
// Phase 4: every map entry corresponds to a live HTTP route / IPC channel with
// the SAME canonical request shape. Protocol-only operations (execute-action,
// send, retry, channel:list, get-stats) remain documented as explicit
// unsupported transport surfaces — never a silently different payload on one host.
export type NotificationRpcMap = {
  // === CRUD / status ===
  'notification:create': [CreateNotificationReq, CreateNotificationRes];
  'notification:delete': [DeleteNotificationInvocation, null];
  'notification:mark-read': [MarkNotificationReadInvocation, NotificationResponse];
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

  // === Channels (protocol-only; no live transport) ===
  'notification:send': [SendNotificationReq, SendNotificationRes];
  'notification-channel:retry': [RetryChannelReq, RetryChannelRes];
  'notification-channel:list': [ListNotificationChannelsReq, ListNotificationChannelsRes];
};
