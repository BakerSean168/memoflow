import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId, NotificationId } from '@memoflow/shared-primitives';

/**
 * Notification Deleted Event
 *
 * Triggered when a notification is soft-deleted.
 */
export interface NotificationDeletedEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
  isSoftDelete: boolean;
  deletedAt: number;
}
