import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId, NotificationId } from '@memoflow/shared-primitives';

/**
 * Notification Created Event
 *
 * Triggered when a new notification aggregate is created.
 */
export interface NotificationCreatedEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
}
