import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId, NotificationId } from '@memoflow/shared-primitives';

/**
 * Notification Read Event
 *
 * Triggered when a notification is marked as read.
 */
export interface NotificationReadEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
  readAt: number;
}
