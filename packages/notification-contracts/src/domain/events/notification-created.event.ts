import type { NotificationServerDTO } from '../../aggregates/notification-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { NotificationId } from '../../value-objects/notification-id';

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
