import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  NotificationCategory,
  NotificationEventMap,
  NotificationServerDTO,
  NotificationType,
  NotificationChannelType,
} from '@memoflow/contracts/notification';
import type { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import type {
  INotificationRepository,
  NotificationDeliveryUsage,
  NotificationOutboxDispatchPlan,
} from '../../../domain/repositories/i-notification-repository';
import type { NotificationDeliveryDecision } from '../../../domain/services/notification-policy';
import { Notification } from '../../../domain/aggregates/notification';
import { NotificationChannel } from '../../../domain/entities/notification-channel';
import { NotificationId, NotificationAction, NotificationMetadata, NotificationChannelId, ChannelError, ChannelResponse } from '../../../domain/value-objects';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';
// Residual 1025: sole parseJsonSafe (local dual retired).
import { parseJsonSafe } from '@memoflow/utils/shared';

const notificationEventPublisher = createTypedEventPublisher<NotificationEventMap>(eventBus);

interface NotificationRow {
  id: string;
  identity_id: string;
  title: string;
  content: string;
  type: string;
  category: string;
  workflow_key: string;
  topic: string;
  idempotency_key: string;
  importance: string | null;
  urgency: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  navigation_intent: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  is_read: number | null;
  read_at: string | null;
  metadata: string | null;
  actions: string | null;
  expires_at: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;
}

interface NotificationChannelRow {
  id: string;
  identity_id: string;
  notification_id: string;
  channel_type: string;
  status: string;
  recipient: string | null;
  max_retries: number;
  retry_count: number;
  attempts: number;
  sent_at: string | null;
  failed_at: string | null;
  error: string | null;
  response: string | null;
}

// Residual 1101 keep-boundary: PowerSync row ISO string → number|null (empty/invalid → null).
// Soft residual 1101: projection unknown→undefined and AI positive-only keep-boundaries (no force-merge).
// Soft residual 1141: auth PowerSync toMillis (same string→null shape; co-located; no force-merge).
function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}


function toServerDTO(row: NotificationRow): NotificationServerDTO {
  return {
    id: row.id as NotificationServerDTO['id'],
    identityId: row.identity_id as NotificationServerDTO['identityId'],
    workflowKey: row.workflow_key,
    topic: row.topic,
    idempotencyKey: row.idempotency_key,
    title: row.title,
    content: row.content,
    type: row.type as NotificationType,
    category: row.category as NotificationCategory,
    importance: (row.importance ?? 'Moderate') as ImportanceLevel,
    urgency: (row.urgency ?? 'Medium') as UrgencyLevel,
    relatedEntityType: row.related_entity_type as never,
    relatedEntityId: row.related_entity_id,
    navigationIntent: parseJsonSafe(row.navigation_intent),
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    isRead: row.read_at !== null,
    readAt: toTimestamp(row.read_at),
    actions: parseJsonSafe<NotificationServerDTO['actions']>(row.actions),
    metadata: parseJsonSafe<NotificationServerDTO['metadata']>(row.metadata),
    expiresAt: toTimestamp(row.expires_at),
    version: row.version ?? 1,
    createdAt: toTimestamp(row.created_at) ?? Date.now(),
    updatedAt: toTimestamp(row.updated_at) ?? Date.now(),
    deletedAt: toTimestamp(row.deleted_at),
    archivedAt: toTimestamp(row.archived_at),
    notificationChannels: null,
  };
}

/**
 * Hydrate a single notification_channels row into a domain NotificationChannel
 * entity, mirroring NotificationPrismaMapper.channelToDomain (Prisma baseline):
 * the channel is rehydrated with its persisted status/response/error so the
 * durable worker can reconcile delivery state and persist acks back.
 */
function hydrateNotificationChannel(row: NotificationChannelRow): NotificationChannel {
  const sentAt = toTimestamp(row.sent_at);
  const failedAt = toTimestamp(row.failed_at);
  return NotificationChannel.load({
    id: NotificationChannelId.of(row.id),
    notificationId: NotificationId.of(row.notification_id),
    channelType: row.channel_type as never,
    status: row.status as never,
    recipient: row.recipient,
    sendAttempts: row.retry_count,
    maxRetries: row.max_retries,
    error: row.error ? ChannelError.fromDTO(parseJsonSafe(row.error)!) : null,
    response: row.response ? ChannelResponse.fromDTO(parseJsonSafe(row.response)!) : null,
    sentAt: sentAt ? new Date(sentAt) : null,
    failedAt: failedAt ? new Date(failedAt) : null,
  });
}

function hydrateNotification(row: NotificationRow, channels: NotificationChannelRow[] = []): Notification {
  const dto = toServerDTO(row);

  return Notification.load({
    id: NotificationId.of(String(dto.id)),
    identityId: dto.identityId,
    workflowKey: dto.workflowKey,
    topic: dto.topic,
    idempotencyKey: dto.idempotencyKey,
    title: dto.title,
    content: dto.content,
    type: dto.type,
    category: dto.category,
    importance: dto.importance,
    urgency: dto.urgency,
    relatedEntityType: dto.relatedEntityType ?? null,
    relatedEntityId: dto.relatedEntityId ?? null,
    correlationId: dto.correlationId ?? null,
    causationId: dto.causationId ?? null,
    isRead: dto.isRead,
    readAt: dto.readAt ?? null,
    actions: dto.actions?.map((action) => NotificationAction.fromDTO(action)) ?? null,
    metadata: dto.metadata ? NotificationMetadata.fromDTO(dto.metadata) : null,
    navigationIntent: dto.navigationIntent ?? null,
    expiresAt: dto.expiresAt ?? null,
    version: dto.version,
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
    archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    notificationChannels: channels.map(hydrateNotificationChannel),
  });
}

import { NotificationOutboxDispatchInputSchema } from '@memoflow/contracts/reliable-messaging';
import { randomUUID } from 'crypto';
import type { NotificationMetricsService } from '../../../domain/services/notification-metrics-service';

export class PowerSyncNotificationRepository implements INotificationRepository {
  private tablesInitialized = false;

  constructor(
    private readonly db: IElectronDatabase,
    private readonly metricsService?: NotificationMetricsService,
  ) {}

  private async ensureTablesExist(): Promise<void> {
    if (this.tablesInitialized) return;
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notification_channels (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        status TEXT NOT NULL,
        recipient TEXT NOT NULL,
        max_retries INTEGER NOT NULL DEFAULT 3,
        retry_count INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at TEXT,
        failed_at TEXT,
        error TEXT,
        response TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        actor_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notification_delivery_decisions (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        outcome TEXT NOT NULL,
        reason TEXT NOT NULL,
        preference_source TEXT,
        retry_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(notification_id, channel)
      );
    `);
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notification_dispatch_outbox (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'notification',
        occurrence_key TEXT NOT NULL,
        channel TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        owner_token TEXT,
        claim_id TEXT,
        fencing_token INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TEXT,
        last_heartbeat_at TEXT,
        heartbeat_interval_ms INTEGER,
        last_error TEXT,
        next_retry_at TEXT,
        dead_letter_at TEXT,
        correlation_id TEXT,
        causation_id TEXT,
        attempts_history_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);
    this.tablesInitialized = true;
  }

  async save(
    notification: Notification,
    outboxDispatches?: NotificationOutboxDispatchPlan[],
    deliveryDecisions?: readonly NotificationDeliveryDecision[],
  ): Promise<void> {
    await this.ensureTablesExist();
    const dto = notification.toServerDTO();
    await this.db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional<{ id: string }>(
      `SELECT id FROM notifications WHERE id = ? LIMIT 1`,
      [dto.id],
    );

    if (existing) {
      await tx.execute(
        `UPDATE notifications
            SET identity_id = ?, workflow_key = ?, topic = ?, idempotency_key = ?,
                title = ?, content = ?, type = ?, category = ?, importance = ?, urgency = ?,
                is_read = ?, read_at = ?, related_entity_type = ?, related_entity_id = ?,
                navigation_intent = ?, correlation_id = ?, causation_id = ?, metadata = ?, actions = ?,
                expires_at = ?, version = ?, updated_at = ?, deleted_at = ?, archived_at = ?
          WHERE id = ?`,
        [
          dto.identityId, dto.workflowKey, dto.topic, dto.idempotencyKey,
          dto.title, dto.content, dto.type, dto.category, dto.importance, dto.urgency,
          dto.isRead ? 1 : 0, dto.readAt ? new Date(dto.readAt).toISOString() : null,
          dto.relatedEntityType ?? null, dto.relatedEntityId ?? null,
          dto.navigationIntent ? JSON.stringify(dto.navigationIntent) : null,
          dto.correlationId ?? null, dto.causationId ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
          dto.actions ? JSON.stringify(dto.actions) : null,
          dto.expiresAt ? new Date(dto.expiresAt).toISOString() : null,
          dto.version, new Date(dto.updatedAt).toISOString(),
          dto.deletedAt ? new Date(dto.deletedAt).toISOString() : null,
          dto.archivedAt ? new Date(dto.archivedAt).toISOString() : null, dto.id,
        ],
      );
    } else {
      await tx.execute(
        `INSERT INTO notifications (
            id, identity_id, workflow_key, topic, idempotency_key, title, content, type, category,
            importance, urgency, is_read, read_at, related_entity_type, related_entity_id,
            navigation_intent, correlation_id, causation_id, metadata, actions, expires_at,
            version, created_at, updated_at, deleted_at, archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.id, dto.identityId, dto.workflowKey, dto.topic, dto.idempotencyKey,
          dto.title, dto.content, dto.type, dto.category, dto.importance, dto.urgency,
          dto.isRead ? 1 : 0, dto.readAt ? new Date(dto.readAt).toISOString() : null,
          dto.relatedEntityType ?? null, dto.relatedEntityId ?? null,
          dto.navigationIntent ? JSON.stringify(dto.navigationIntent) : null,
          dto.correlationId ?? null, dto.causationId ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
          dto.actions ? JSON.stringify(dto.actions) : null,
          dto.expiresAt ? new Date(dto.expiresAt).toISOString() : null, dto.version,
          new Date(dto.createdAt).toISOString(), new Date(dto.updatedAt).toISOString(),
          dto.deletedAt ? new Date(dto.deletedAt).toISOString() : null,
          dto.archivedAt ? new Date(dto.archivedAt).toISOString() : null,
        ],
      );
    }

    if (dto.notificationChannels && dto.notificationChannels.length > 0) {
      for (const ch of dto.notificationChannels) {
        const channelId = String(ch.id);
        const existingCh = await tx.getOptional<{ id: string }>(
          `SELECT id FROM notification_channels WHERE id = ? LIMIT 1`,
          [channelId],
        );
        const sentAtIso = ch.sentAt ? new Date(ch.sentAt).toISOString() : null;
        const failedAtIso = ch.failedAt ? new Date(ch.failedAt).toISOString() : null;
        const errorJson = ch.error ? JSON.stringify(ch.error) : null;
        const responseJson = ch.response ? JSON.stringify(ch.response) : null;

        if (existingCh) {
          await tx.execute(
            `UPDATE notification_channels
                SET channel_type = ?,
                    status = ?,
                    recipient = ?,
                    max_retries = ?,
                    retry_count = ?,
                    attempts = ?,
                    sent_at = ?,
                    failed_at = ?,
                    error = ?,
                    response = ?,
                    updated_at = ?
              WHERE id = ?`,
            [
              ch.channelType,
              ch.status,
              ch.recipient,
              ch.maxRetries,
              ch.sendAttempts,
              ch.sendAttempts,
              sentAtIso,
              failedAtIso,
              errorJson,
              responseJson,
              new Date().toISOString(),
              channelId,
            ],
          );
        } else {
          await tx.execute(
            `INSERT INTO notification_channels (
                id, identity_id, notification_id, channel_type, status, recipient,
                max_retries, retry_count, attempts, sent_at, failed_at, error, response,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              channelId,
              dto.identityId,
              dto.id,
              ch.channelType,
              ch.status,
              ch.recipient,
              ch.maxRetries,
              ch.sendAttempts,
              ch.sendAttempts,
              sentAtIso,
              failedAtIso,
              errorJson,
              responseJson,
              new Date().toISOString(),
              new Date().toISOString(),
            ],
          );
        }
      }
    }

    if (outboxDispatches && outboxDispatches.length > 0) {
      const nowIso = new Date().toISOString();
      for (const outboxInput of outboxDispatches) {
        const validatedInput = NotificationOutboxDispatchInputSchema.parse(outboxInput);
        const existingOutbox = await tx.getOptional<{ id: string }>(
          `SELECT id FROM notification_dispatch_outbox WHERE idempotency_key = ? LIMIT 1`,
          [validatedInput.idempotencyKey],
        );

        if (!existingOutbox) {
          const notificationId = String(dto.id);
          await tx.execute(
            `INSERT INTO notification_dispatch_outbox (
              id, identity_id, notification_id, source, occurrence_key, channel,
              payload_json, idempotency_key, status, attempt, fencing_token, next_retry_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
            [
              validatedInput.operationId,
              validatedInput.identityId,
              notificationId,
              validatedInput.source,
              validatedInput.occurrenceKey,
              validatedInput.channel,
              validatedInput.payloadJson,
              validatedInput.idempotencyKey,
              outboxInput.deferUntil ? 'retryable' : 'pending',
              outboxInput.deferUntil?.toISOString() ?? null,
              nowIso,
              nowIso,
            ],
          );
          this.metricsService?.recordPersisted();
        }
      }
    }

    for (const decision of deliveryDecisions ?? []) {
      const nowIso = new Date().toISOString();
      const existingDecision = await tx.getOptional<{ id: string }>(
        `SELECT id FROM notification_delivery_decisions WHERE notification_id = ? AND channel = ? LIMIT 1`,
        [dto.id, decision.channel],
      );
      if (existingDecision) {
        await tx.execute(
          `UPDATE notification_delivery_decisions
             SET outcome = ?, reason = ?, preference_source = ?, retry_at = ?, updated_at = ?
           WHERE id = ?`,
          [decision.outcome, decision.reason, decision.preferenceSource ?? null,
           decision.retryAt?.toISOString() ?? null, nowIso, existingDecision.id],
        );
      } else {
        await tx.execute(
          `INSERT INTO notification_delivery_decisions (
             id, identity_id, notification_id, channel, outcome, reason, preference_source,
             retry_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), dto.identityId, dto.id, decision.channel, decision.outcome, decision.reason,
           decision.preferenceSource ?? null, decision.retryAt?.toISOString() ?? null, nowIso, nowIso],
        );
      }
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
    const hourStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const row = await this.db.getOptional<{ hour_count: number | null; day_count: number | null }>(
      `SELECT
         SUM(CASE WHEN n.created_at >= ? THEN 1 ELSE 0 END) AS hour_count,
         COUNT(*) AS day_count
       FROM notification_channels c
       JOIN notifications n ON n.id = c.notification_id
       WHERE c.identity_id = ?
         AND c.channel_type = ?
         AND n.workflow_key = ?
         AND n.created_at >= ?`,
      [hourStart, identityId, channel, workflowKey, dayStart],
    );

    return {
      hourCount: Number(row?.hour_count ?? 0),
      dayCount: Number(row?.day_count ?? 0),
    };
  }

  private async loadChannels(notificationId: string): Promise<NotificationChannelRow[]> {
    return this.db.getAll<NotificationChannelRow>(
      `SELECT * FROM notification_channels WHERE notification_id = ? ORDER BY created_at ASC`,
      [notificationId],
    );
  }

  /**
   * Hydrate notification rows together with their child notification_channels
   * rows (single batched query), mirroring the Prisma baseline which includes
   * channels by default (INCLUDE_CHANNELS).
   */
  private async hydrateWithChannels(rows: NotificationRow[]): Promise<Notification[]> {
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => '?').join(', ');
    const channelRows = await this.db.getAll<NotificationChannelRow>(
      `SELECT * FROM notification_channels WHERE notification_id IN (${placeholders}) ORDER BY created_at ASC`,
      rows.map((row) => row.id),
    );
    const channelsByNotificationId = new Map<string, NotificationChannelRow[]>();
    for (const channelRow of channelRows) {
      const list = channelsByNotificationId.get(channelRow.notification_id) ?? [];
      list.push(channelRow);
      channelsByNotificationId.set(channelRow.notification_id, list);
    }
    return rows.map((row) => hydrateNotification(row, channelsByNotificationId.get(row.id) ?? []));
  }

  async findChannelsByStatus(status: string, limit?: number): Promise<Notification[]> {
    const rows = await this.db.getAll<NotificationRow>(
      `SELECT n.* FROM notifications n
       JOIN notification_channels c ON c.notification_id = n.id
       WHERE n.deleted_at IS NULL AND c.status = ? ${limit ? 'LIMIT ?' : ''}`,
      limit ? [status, limit] : [status],
    );
    return this.hydrateWithChannels(rows);
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
    _options?: { includeChildren?: boolean },
  ): Promise<Notification | null> {
    const row = await this.db.getOptional<NotificationRow>(
      `SELECT * FROM notifications WHERE id = ? AND identity_id = ? LIMIT 1`,
      [id, identityId],
    );
    if (!row) return null;
    const channels = await this.loadChannels(row.id);
    return hydrateNotification(row, channels);
  }

  async findByIdempotencyKey(identityId: string, idempotencyKey: string): Promise<Notification | null> {
    const row = await this.db.getOptional<NotificationRow>(
      `SELECT * FROM notifications WHERE identity_id = ? AND idempotency_key = ? LIMIT 1`,
      [identityId, idempotencyKey],
    );
    if (!row) return null;
    const channels = await this.loadChannels(row.id);
    return hydrateNotification(row, channels);
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
    const filters = ['identity_id = ?'];
    const params: unknown[] = [identityId];

    if (!options?.includeDeleted) {
      filters.push('deleted_at IS NULL');
    }
    if (options?.includeRead === false) {
      filters.push('read_at IS NULL');
    }
    if (options?.archiveState === 'active' || options?.archiveState === undefined) {
      filters.push('archived_at IS NULL');
    } else if (options.archiveState === 'archived') {
      filters.push('archived_at IS NOT NULL');
    }

    let sql = `SELECT * FROM notifications WHERE ${filters.join(' AND ')} ORDER BY created_at DESC`;
    if (typeof options?.limit === 'number') {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (typeof options?.offset === 'number') {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await this.db.getAll<NotificationRow>(sql, params);
    return this.hydrateWithChannels(rows);
  }

  async findByCategory(
    identityId: string,
    category: NotificationCategory,
    options?: { archiveState?: 'active' | 'archived' | 'all'; limit?: number; offset?: number },
  ): Promise<Notification[]> {
    return this.findByIdentityId(identityId, {
      ...options,
      includeDeleted: false,
    }).then((items) => items.filter((item) => item.toServerDTO().category === category));
  }

  async findUnread(identityId: string, options?: { archiveState?: 'active' | 'archived' | 'all'; limit?: number }): Promise<Notification[]> {
    return this.findByIdentityId(identityId, {
      includeRead: false,
      includeDeleted: false,
      archiveState: options?.archiveState,
      limit: options?.limit,
    });
  }

  async findByRelatedEntity(
    identityId: string,
    relatedEntityType: string,
    relatedEntityId: string,
    options?: { archiveState?: 'active' | 'archived' | 'all' },
  ): Promise<Notification[]> {
    const archiveFilter = options?.archiveState === 'archived'
      ? 'AND archived_at IS NOT NULL'
      : options?.archiveState === 'all'
        ? ''
        : 'AND archived_at IS NULL';
    const rows = await this.db.getAll<NotificationRow>(
      `SELECT * FROM notifications
        WHERE identity_id = ?
          AND related_entity_type = ?
          AND related_entity_id = ?
          AND deleted_at IS NULL
          ${archiveFilter}
        ORDER BY created_at DESC`,
      [identityId, relatedEntityType, relatedEntityId],
    );
    return this.hydrateWithChannels(rows);
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Notification not found for the current identity.');
    }
    await this.db.execute(
      `DELETE FROM notifications WHERE id = ? AND identity_id = ?`,
      [id, identityId],
    );
  }

  async deleteMany(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `DELETE FROM notifications WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
  }

  async softDelete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Notification not found for the current identity.');
    }
    await this.db.execute(
      `UPDATE notifications SET deleted_at = ? WHERE id = ? AND identity_id = ?`,
      [new Date().toISOString(), id, identityId],
    );
  }

  async archive(identityId: string, id: string, archivedAt: Date): Promise<void> {
    const result = await this.db.execute(
      `UPDATE notifications SET archived_at = ?, updated_at = ?
        WHERE id = ? AND identity_id = ? AND deleted_at IS NULL`,
      [archivedAt.toISOString(), archivedAt.toISOString(), id, identityId],
    );
    if (result.rowsAffected !== 1) throw new Error('Notification not found for the current identity.');
  }

  async restore(identityId: string, id: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await this.db.execute(
      `UPDATE notifications SET archived_at = NULL, updated_at = ?
        WHERE id = ? AND identity_id = ? AND deleted_at IS NULL`,
      [now, id, identityId],
    );
    if (result.rowsAffected !== 1) throw new Error('Notification not found for the current identity.');
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    return (await this.findByIdForIdentity(identityId, id)) !== null;
  }

  async countUnread(identityId: string): Promise<number> {
    const row = await this.db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count
         FROM notifications
        WHERE identity_id = ?
          AND deleted_at IS NULL
          AND archived_at IS NULL
          AND read_at IS NULL`,
      [identityId],
    );
    return Number(row?.count ?? 0);
  }

  async countByCategory(_identityId: string): Promise<Record<NotificationCategory, number>> {
    const rows = await this.db.getAll<{ category: NotificationCategory; count: number }>(
      `SELECT category, COUNT(*) as count
         FROM notifications
        WHERE identity_id = ?
          AND deleted_at IS NULL
        GROUP BY category`,
      [_identityId],
    );

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
      counts[row.category] = Number(row.count ?? 0);
    }

    return counts;
  }

  async markManyAsRead(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `UPDATE notifications
          SET is_read = 1,
              read_at = ?,
              updated_at = ?
        WHERE identity_id = ?
          AND id IN (${placeholders})`,
      [new Date().toISOString(), new Date().toISOString(), identityId, ...ids],
    );
  }

  async markAllAsRead(identityId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE notifications
          SET is_read = 1,
              read_at = COALESCE(read_at, ?),
              updated_at = ?
        WHERE identity_id = ?
          AND deleted_at IS NULL
          AND archived_at IS NULL
          AND read_at IS NULL`,
      [now, now, identityId],
    );
  }

  async cleanupExpired(beforeTimestamp: number): Promise<number> {
    const before = new Date(beforeTimestamp).toISOString();
    const result = await this.db.execute(
      `DELETE FROM notifications WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at < ?`,
      [before],
    );
    return result.rowsAffected;
  }

  async cleanupDeleted(beforeTimestamp: number): Promise<number> {
    const before = new Date(beforeTimestamp).toISOString();
    const result = await this.db.execute(
      `DELETE FROM notifications WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
      [before],
    );
    return result.rowsAffected;
  }
}
