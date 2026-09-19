import type { IdentityId, NotificationId } from '../../../../primitives';
import type { NotificationServerDTO } from '../../aggregates/notification-server';

export interface NotificationArchivedEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
  archivedAt: number;
}
