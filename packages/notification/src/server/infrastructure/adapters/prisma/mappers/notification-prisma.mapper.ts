// Residual 1025: sole parseJsonSafe (local dual retired).
import { parseJsonSafe } from '@memoflow/utils/shared';
/**
 * NotificationPrismaMapper — Bidirectional mapping between Prisma rows and domain Notification aggregate.
 * NotificationPrismaMapper —— Prisma 行数据与领域 Notification 聚合根之间的双向映射。
 *
 * Handles mapping for:
 * 处理以下映射：
 * - Notification aggregate root (with nested channels and history)
 *   Notification 聚合根（含嵌套的 channels 和 history）
 * - NotificationChannel child entity
 *   NotificationChannel 子实体
 * - NotificationHistory child entity
 *   NotificationHistory 子实体
 *
 * @internal Persistence mapper — not part of the public API.
 * @internal 持久化映射器 — 非公开 API。
 */

import type {
  NotificationCategory,
  NotificationChannelType,
  ChannelStatus,
  NotificationActionDTO,
  NotificationMetadataDTO,
  NotificationNavigationIntentDTO,
} from '@memoflow/contracts/notification';
import type { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationChannel } from '../../../../domain/entities/notification-channel';
import { NotificationHistory } from '../../../../domain/entities/notification-history';
import {
  NotificationId,
  NotificationChannelId,
  NotificationAction,
  NotificationMetadata,
  ChannelError,
  ChannelResponse,
} from '../../../../domain/value-objects';

// ============================================================
// Prisma row types
// ============================================================

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

export type PrismaNotificationChannelRow = {
  id: string;
  identityId: string;
  notificationId: string;
  channelType: string;
  status: string;
  recipient: string | null;
  maxRetries: number;
  retryCount: number;
  error: string | null;
  response: string | null;
  failedAt: Date | null;
  attempts: number;
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
  channels?: PrismaNotificationChannelRow[];
  history?: PrismaNotificationHistoryRow[];
};

// ============================================================
// Helpers
// ============================================================


// ============================================================
// Mapper
// ============================================================

export class NotificationPrismaMapper {
  /**
   * Converts a Prisma row to a domain NotificationChannel entity.
   * 将 Prisma 行数据转换为领域 NotificationChannel 实体。
   */
  static channelToDomain(row: PrismaNotificationChannelRow): NotificationChannel {
    return NotificationChannel.load({
      id: NotificationChannelId.of(row.id),
      notificationId: NotificationId.of(row.notificationId),
      channelType: row.channelType as NotificationChannelType,
      status: row.status as ChannelStatus,
      recipient: row.recipient,
      sendAttempts: row.retryCount,
      maxRetries: row.maxRetries,
      error: row.error ? ChannelError.fromDTO(parseJsonSafe(row.error)!) : null,
      response: row.response ? ChannelResponse.fromDTO(parseJsonSafe(row.response)!) : null,
      sentAt: null,
      failedAt: null,
    });
  }

  /**
   * Converts a Prisma row to a domain NotificationHistory entity.
   * 将 Prisma 行数据转换为领域 NotificationHistory 实体。
   */
  static historyToDomain(row: PrismaNotificationHistoryRow): NotificationHistory {
    return NotificationHistory.load({
      id: row.id as never,
      notificationId: row.notificationId as never,
      action: row.action,
      details: parseJsonSafe(row.details),
      createdAt: row.createdAt,
    });
  }

  /**
   * Converts a Prisma row (with relations) to a domain Notification aggregate.
   * 将 Prisma 行数据（含关联）转换为领域 Notification 聚合根。
   *
   * @param row - Prisma notification row with optional channels/history relations
   * @returns Hydrated Notification aggregate
   */
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
      actions: actions ? actions.map((a) => NotificationAction.fromDTO(a)) : null,
      metadata: metadata ? NotificationMetadata.fromDTO(metadata) : null,
      navigationIntent: parseJsonSafe<NotificationNavigationIntentDTO>(row.navigationIntent),
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
      version: row.version,
      deletedAt: row.deletedAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      notificationChannels: row.channels ? row.channels.map(NotificationPrismaMapper.channelToDomain) : [],
    });
  }
}
