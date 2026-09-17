/**
 * Notification Prisma Repository.
 * 通知 Prisma 仓储。
 *
 * Prisma implementation of INotificationRepository.
 * INotificationRepository 的 Prisma 实现。
 */

import type { PrismaClient, Prisma } from '@memoflow/database';
import type {
  INotificationRepository,
  NotificationDeliveryUsage,
  NotificationOutboxDispatchPlan,
} from '../../../domain/repositories/i-notification-repository';
import type { NotificationDeliveryDecision } from '../../../domain/services/notification-policy';
import type { NotificationCategory, NotificationEventMap, NotificationChannelType } from '@memoflow/contracts/notification';
import { Notification } from '../../../domain/aggregates/notification';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';
import {
  NotificationPrismaMapper,
  type PrismaNotificationWithRelations,
} from './mappers/notification-prisma.mapper';

import { NotificationOutboxDispatchInputSchema } from '@memoflow/contracts/reliable-messaging';
import { randomUUID } from 'crypto';

const notificationEventPublisher = createTypedEventPublisher<NotificationEventMap>(eventBus);


/**
 * Notification Prisma Repository
 */
export class NotificationPrismaRepository implements INotificationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly metricsService?: import('../../../domain/services/notification-metrics-service').NotificationMetricsService,
  ) {}

  async save(
    notification: Notification,
    outboxDispatches?: NotificationOutboxDispatchPlan[],
    deliveryDecisions?: readonly NotificationDeliveryDecision[],
  ): Promise<void> {
    const dto = notification.toServerDTO();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Upsert the Notification aggregate root
      await tx.notification.upsert({
        where: { id: String(dto.id) },
        create: {
          id: String(dto.id),
          identityId: String(dto.identityId),
          title: dto.title,
          content: dto.content,
          type: dto.type,
          category: dto.category,
          workflowKey: dto.workflowKey,
          topic: dto.topic,
          idempotencyKey: dto.idempotencyKey,
          importance: dto.importance,
          urgency: dto.urgency,
          relatedEntityType: dto.relatedEntityType ?? null,
          relatedEntityId: dto.relatedEntityId ?? null,
          correlationId: dto.correlationId ?? null,
          causationId: dto.causationId ?? null,
          isRead: dto.isRead,
          readAt: dto.readAt ? new Date(dto.readAt) : null,
          metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
          actions: dto.actions ? JSON.stringify(dto.actions) : null,
          navigationIntent: dto.navigationIntent ? JSON.stringify(dto.navigationIntent) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          version: dto.version,
          deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
          archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
        },
        update: {
          title: dto.title,
          content: dto.content,
          type: dto.type,
          category: dto.category,
          workflowKey: dto.workflowKey,
          topic: dto.topic,
          idempotencyKey: dto.idempotencyKey,
          importance: dto.importance,
          urgency: dto.urgency,
          relatedEntityType: dto.relatedEntityType ?? null,
          relatedEntityId: dto.relatedEntityId ?? null,
          correlationId: dto.correlationId ?? null,
          causationId: dto.causationId ?? null,
          isRead: dto.isRead,
          readAt: dto.readAt ? new Date(dto.readAt) : null,
          metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
          actions: dto.actions ? JSON.stringify(dto.actions) : null,
          navigationIntent: dto.navigationIntent ? JSON.stringify(dto.navigationIntent) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          version: dto.version,
          deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
          archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
          updatedAt: new Date(),
        },
      });

      // 2. Save NotificationDispatchOutbox entries in the same transaction
      if (outboxDispatches && outboxDispatches.length > 0) {
        let insertedCount = 0;
        const now = new Date();
        for (const outboxInput of outboxDispatches) {
          const validatedInput = NotificationOutboxDispatchInputSchema.parse(outboxInput);
          const existing = await tx.notificationDispatchOutbox.findUnique({
            where: { idempotencyKey: validatedInput.idempotencyKey },
          });

          if (!existing) {
            // The aggregate being saved IS the notificationId: never parse the
            // occurrenceKey (W1 occurrenceKeys are `${templateId}:${time}`).
            const notificationId = String(dto.id);

            await tx.notificationDispatchOutbox.create({
              data: {
                id: validatedInput.operationId,
                identityId: validatedInput.identityId,
                notificationId,
                source: validatedInput.source,
                occurrenceKey: validatedInput.occurrenceKey,
                channel: validatedInput.channel,
                payloadJson: validatedInput.payloadJson,
                idempotencyKey: validatedInput.idempotencyKey,
                status: outboxInput.deferUntil ? 'retryable' : 'pending',
                attempt: 0,
                fencingToken: 0,
                nextRetryAt: outboxInput.deferUntil ?? null,
                createdAt: now,
                updatedAt: now,
              },
            });
            insertedCount++;
          }
        }
        if (insertedCount > 0 && this.metricsService) {
          this.metricsService.recordPersisted(insertedCount);
        }
      }

      for (const decision of deliveryDecisions ?? []) {
        await tx.notificationDeliveryDecisionRecord.upsert({
          where: {
            notificationId_channel: {
              notificationId: String(dto.id),
              channel: decision.channel,
            },
          },
          create: {
            id: randomUUID(),
            identityId: String(dto.identityId),
            notificationId: String(dto.id),
            channel: decision.channel,
            outcome: decision.outcome,
            reason: decision.reason,
            preferenceSource: decision.preferenceSource ?? null,
            retryAt: decision.retryAt ?? null,
          },
          update: {
            outcome: decision.outcome,
            reason: decision.reason,
            preferenceSource: decision.preferenceSource ?? null,
            retryAt: decision.retryAt ?? null,
          },
        });
      }
    });

    flushDomainEvents(notificationEventPublisher, notification);
  }

  async saveMany(notifications: Notification[]): Promise<void> {
    for (const notification of notifications) {
      await this.save(notification);
    }
  }

  async getDeliveryUsage(
    identityId: string,
    workflowKey: string,
    channel: NotificationChannelType,
    now: Date,
  ): Promise<NotificationDeliveryUsage> {
    const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const plannedOutcomes = ['enqueued', 'deferred'];
    const count = (since: Date) => this.prisma.notificationDeliveryDecisionRecord.count({
      where: {
        identityId,
        channel,
        outcome: { in: plannedOutcomes },
        notification: { is: { workflowKey, createdAt: { gte: since } } },
      },
    });
    const [hourCount, dayCount] = await Promise.all([count(hourStart), count(dayStart)]);
    return { hourCount, dayCount };
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeChildren?: boolean },
  ): Promise<Notification | null> {
    const row = await this.prisma.notification.findFirst({
      where: { id, identityId },
    });
    if (!row) return null;
    return NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations);
  }

  async findByIdempotencyKey(identityId: string, idempotencyKey: string): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({
      where: { identityId_idempotencyKey: { identityId, idempotencyKey } },
    });
    return row ? NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations) : null;
  }

  async findByIdentityId(
    identityId: string,
    options?: {
      includeChildren?: boolean;
      includeRead?: boolean;
      includeDeleted?: boolean;
      archiveState?: 'active' | 'archived' | 'all';
      limit?: number;
      offset?: number;
    },
  ): Promise<Notification[]> {
    const where: Prisma.NotificationWhereInput = { identityId };

    if (!options?.includeDeleted) {
      where.deletedAt = null;
    }
    if (options?.includeRead === false) {
      where.readAt = null;
    }
    if (options?.archiveState === 'active' || options?.archiveState === undefined) {
      where.archivedAt = null;
    } else if (options.archiveState === 'archived') {
      where.archivedAt = { not: null };
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });

    return rows.map((row) => NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations));
  }

  async findByCategory(
    identityId: string,
    category: NotificationCategory,
    options?: { archiveState?: 'active' | 'archived' | 'all'; limit?: number; offset?: number },
  ): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        identityId,
        category,
        deletedAt: null,
        ...(options?.archiveState === 'archived' ? { archivedAt: { not: null } } : options?.archiveState === 'all' ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });

    return rows.map((row) => NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations));
  }

  async findUnread(identityId: string, options?: { limit?: number }): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        identityId,
        readAt: null,
        deletedAt: null,
        archivedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
    });

    return rows.map((row) => NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations));
  }

  async findByRelatedEntity(
    identityId: string,
    relatedEntityType: string,
    relatedEntityId: string,
    options?: { archiveState?: 'active' | 'archived' | 'all' },
  ): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        identityId,
        relatedEntityType,
        relatedEntityId,
        deletedAt: null,
        ...(options?.archiveState === 'archived' ? { archivedAt: { not: null } } : options?.archiveState === 'all' ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => NotificationPrismaMapper.toDomain(row as PrismaNotificationWithRelations));
  }

  async delete(identityId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.deleteMany({
      where: { id, identityId },
    });
    if (result.count !== 1) {
      throw new Error('Notification not found for the current identity.');
    }
  }

  async deleteMany(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.notification.deleteMany({
      where: { id: { in: ids }, identityId },
    });
  }

  async softDelete(identityId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, identityId },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new Error('Notification not found for the current identity.');
    }
  }

  async archive(identityId: string, id: string, archivedAt: Date): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, identityId, deletedAt: null },
      data: { archivedAt, updatedAt: archivedAt },
    });
    if (result.count !== 1) throw new Error('Notification not found for the current identity.');
  }

  async restore(identityId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, identityId, deletedAt: null },
      data: { archivedAt: null, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new Error('Notification not found for the current identity.');
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    const count = await this.prisma.notification.count({ where: { id, identityId } });
    return count > 0;
  }

  async countUnread(identityId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        identityId,
        readAt: null,
        deletedAt: null,
        archivedAt: null,
      },
    });
  }

  async countByCategory(identityId: string): Promise<Record<NotificationCategory, number>> {
    const rows = await this.prisma.notification.groupBy({
      by: ['category'],
      where: {
        identityId,
        deletedAt: null,
        archivedAt: null,
      },
      _count: { id: true },
    });

    const counts = {
      Task: 0,
      Goal: 0,
      Schedule: 0,
      Reminder: 0,
      Account: 0,
      System: 0,
      Other: 0,
    } as Record<NotificationCategory, number>;

    for (const row of rows) {
      counts[row.category as NotificationCategory] = row._count.id;
    }

    return counts;
  }

  async markManyAsRead(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date();
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, identityId, deletedAt: null },
      data: {
        isRead: true,
        readAt: now,
        updatedAt: now,
      },
    });
  }

  async markAllAsRead(identityId: string): Promise<void> {
    const now = new Date();
    await this.prisma.notification.updateMany({
      where: {
        identityId,
        readAt: null,
        deletedAt: null,
        archivedAt: null,
      },
      data: {
        isRead: true,
        readAt: now,
        updatedAt: now,
      },
    });
  }

  async cleanupExpired(beforeTimestamp: number): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        expiresAt: {
          not: null,
          lt: new Date(beforeTimestamp),
        },
      },
    });
    return result.count;
  }

  async cleanupDeleted(beforeTimestamp: number): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: {
        deletedAt: {
          not: null,
          lt: new Date(beforeTimestamp),
        },
      },
    });
    return result.count;
  }
}
