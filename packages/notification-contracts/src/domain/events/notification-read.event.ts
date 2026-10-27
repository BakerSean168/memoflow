import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { NotificationId } from '../../value-objects/notification-id';

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
