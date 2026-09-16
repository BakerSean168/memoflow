/** Notification Fact server contract. Delivery state lives on channel/outbox records. */
import type { NotificationType } from '../value-objects/notification-type';
import type { NotificationCategory } from '../value-objects/notification-category';
import type { NotificationMetadataDTO } from '../value-objects/notification-metadata';
import type { NotificationActionDTO } from '../value-objects/notification-action';
import type { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { UrgencyLevel } from '../../../shared/value-objects/urgency';
import type { NotificationChannelServerDTO } from '../entities/notification-channel-server';
import type { IdentityId, NotificationId, TransferDate } from '../../../primitives';
import type { RelatedEntityType } from '../value-objects/related-entity-type';

export interface NotificationNavigationIntentDTO {
  route: string;
  params?: Record<string, string>;
}

/**
 * Durable user-visible fact. `read` is presentation state of the fact itself;
 * delivery outcomes are deliberately absent from this root contract.
 */
export interface NotificationServerDTO {
  id: NotificationId;
  identityId: IdentityId;
  workflowKey: string;
  topic: string;
  idempotencyKey: string;

  title: string;
  content: string;
  type: NotificationType;
  category: NotificationCategory;
  importance: ImportanceLevel;
  urgency: UrgencyLevel;

  relatedEntityType?: RelatedEntityType | null;
  relatedEntityId?: string | null;
  navigationIntent?: NotificationNavigationIntentDTO | null;
  correlationId?: string | null;
  causationId?: string | null;

  isRead: boolean;
  readAt?: TransferDate | null;
  actions?: NotificationActionDTO[] | null;
  metadata?: NotificationMetadataDTO | null;
  expiresAt?: TransferDate | null;

  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
  archivedAt: TransferDate | null;

  /** Convenience projection of durable delivery attempts, not Fact status. */
  notificationChannels?: NotificationChannelServerDTO[] | null;
}
