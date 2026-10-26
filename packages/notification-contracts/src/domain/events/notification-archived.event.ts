import type { IdentityId } from '@memoflow/shared-primitives';
import type { NotificationId } from '../../value-objects/notification-id';
import type { NotificationServerDTO } from '../../aggregates/notification-server';

export interface NotificationArchivedEvent {
  identityId: IdentityId;
  notificationId: NotificationId;
  notification: NotificationServerDTO;
  archivedAt: number;
}
