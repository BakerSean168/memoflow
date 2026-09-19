import type { IdentityId, NotificationId } from '../../../../primitives';
import type { NotificationServerDTO } from '../../aggregates/notification-server';

export interface NotificationRestoredEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
}
