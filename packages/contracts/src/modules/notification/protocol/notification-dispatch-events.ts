import type { NotificationCategory } from '../value-objects/notification-category';
import type { NotificationType } from '../value-objects/notification-type';
import type { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { UrgencyLevel } from '../../../shared/value-objects/urgency';
import type { IdentityId, NotificationId } from '@memoflow/shared-primitives';

export interface NotificationDispatchBase {
  id: NotificationId;
  operationId?: string;
  updatedAt?: string;
  identityId: IdentityId;
  title: string;
  body?: string | null;
  category: NotificationCategory;
  type: NotificationType;
  urgency?: UrgencyLevel;
  importance?: ImportanceLevel;
  data?: Record<string, unknown>;
  sound?: {
    enabled: boolean;
    name?: string | null;
  } | null;
}

export interface NotificationDispatchDesktopEvent extends NotificationDispatchBase {
  icon?: string | null;
  silent?: boolean;
}

export interface NotificationDispatchInAppEvent extends NotificationDispatchBase {
  durationMs?: number | null;
}
