import type { IdentityId, TransferDate } from '@memoflow/shared-primitives';
import type { NotificationId } from '../value-objects/notification-id';
import type { NotificationInteractionId } from '../value-objects/notification-interaction-id';

export type NotificationInteractionKind = 'navigate' | 'owner-command' | 'archive';
export type NotificationInteractionOutcome = 'accepted' | 'rejected' | 'failed';

/** Durable provenance for an action initiated from a Notification surface. */
export interface NotificationInteractionDTO {
  id: NotificationInteractionId;
  idempotencyKey: string;
  identityId: IdentityId;
  notificationId: NotificationId;
  actionKey: string;
  actionKind: NotificationInteractionKind;
  occurredAt: TransferDate;
  commandReceiptId?: string | null;
  outcome: NotificationInteractionOutcome;
  correlationId?: string | null;
  causationId?: string | null;
}
