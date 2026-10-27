import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { NotificationId } from '../../value-objects/notification-id';

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
