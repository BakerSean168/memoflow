import type { NotificationCategory } from '../value-objects/notification-category';
import type { NotificationType } from '../value-objects/notification-type';
import type { ImportanceLevel } from '@memoflow/shared-primitives';
import type { UrgencyLevel } from '@memoflow/shared-primitives';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { NotificationId } from '../value-objects/notification-id';

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

/** Device presentation outcome: suppression is terminal and never a delivered ACK. */
export type DesktopPresentationResult = boolean | { status: 'suppressed'; reason: string };
