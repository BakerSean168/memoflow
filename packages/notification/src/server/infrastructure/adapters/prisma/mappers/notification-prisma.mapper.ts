import { parseJsonSafe } from '@memoflow/utils/shared';
import type {
  NotificationActionDTO,
  NotificationCategory,
  NotificationMetadataDTO,
  NotificationNavigationIntentDTO,
} from '@memoflow/contracts/notification';
import type { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationHistory } from '../../../../domain/entities/notification-history';
import {
  NotificationId,
  NotificationAction,
  NotificationMetadata,
} from '../../../../domain/value-objects';

export type PrismaNotificationRow = {
  id: string;
  identityId: string;
  title: string;
  content: string;
  type: string;
  category: string;
  workflowKey: string;
  topic: string;
  idempotencyKey: string;
  importance: string;
  urgency: string;
  isRead: boolean;
  readAt: Date | null;
  expiresAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  metadata: string | null;
  actions: string | null;
  navigationIntent: string | null;
  correlationId: string | null;
  causationId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  archivedAt: Date | null;
};

export type PrismaNotificationHistoryRow = {
  id: string;
  identityId: string;
  notificationId: string;
  action: string;
  details: string | null;
  actorId: string | null;
  createdAt: Date;
};

export type PrismaNotificationWithRelations = PrismaNotificationRow & {
  history?: PrismaNotificationHistoryRow[];
};

/** Prisma row -> immutable Notification Fact mapper. */
export class NotificationPrismaMapper {
  static historyToDomain(row: PrismaNotificationHistoryRow): NotificationHistory {
    return NotificationHistory.load({
      id: row.id as never,
      notificationId: row.notificationId as never,
      action: row.action,
      details: parseJsonSafe(row.details),
      createdAt: row.createdAt,
    });
  }

  static toDomain(row: PrismaNotificationWithRelations): Notification {
    const actions = parseJsonSafe<NotificationActionDTO[]>(row.actions);
    const metadata = parseJsonSafe<NotificationMetadataDTO>(row.metadata);

    return Notification.load({
      id: NotificationId.of(row.id),
      identityId: row.identityId as never,
      workflowKey: row.workflowKey,
      topic: row.topic,
      idempotencyKey: row.idempotencyKey,
      title: row.title,
      content: row.content,
      type: row.type as never,
      category: row.category as NotificationCategory,
      importance: (row.importance || 'Moderate') as ImportanceLevel,
      urgency: (row.urgency || 'Medium') as UrgencyLevel,
      relatedEntityType: row.relatedEntityType as never,
      relatedEntityId: row.relatedEntityId,
      correlationId: row.correlationId,
      causationId: row.causationId,
      isRead: row.readAt !== null,
      readAt: row.readAt ? row.readAt.getTime() : null,
      actions: actions ? actions.map((action) => NotificationAction.fromDTO(action)) : null,
      metadata: metadata ? NotificationMetadata.fromDTO(metadata) : null,
      navigationIntent: parseJsonSafe<NotificationNavigationIntentDTO>(row.navigationIntent),
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
      version: row.version,
      deletedAt: row.deletedAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
