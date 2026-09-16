import type { IdentityId, NotificationId } from '../../../../primitives';
import type { NotificationServerDTO } from '../../aggregates/notification-server';

export interface NotificationUnreadEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
}
