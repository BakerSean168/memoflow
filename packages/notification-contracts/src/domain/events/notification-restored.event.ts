import type { IdentityId, NotificationId } from '@memoflow/shared-primitives';
import type { NotificationServerDTO } from '../../aggregates/notification-server';

export interface NotificationRestoredEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
}
