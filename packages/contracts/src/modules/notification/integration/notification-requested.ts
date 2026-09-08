/**
 * NotificationRequested durable integration envelope.
 * 可持久化的 NotificationRequested 集成信封（ADR-063 §8 / NOTIF-3301）。
 *
 * Business handlers write this envelope to the shared outbox as a
 * `notification.requested` message. The Notification runtime consumer
 * materializes the Notification Fact + per-channel delivery plan, so a handler
 * commit never depends on external Desktop/Email/Push delivery.
 *
 * 业务处理器将本信封写入共享 outbox（messageType = `notification.requested`），
 * 由 Notification runtime consumer 物化 Notification Fact 与每渠道投递计划，
 * 从而使处理器提交绝不依赖外部 Desktop/Email/Push 投递成功。
 */

import { z } from 'zod';
import { refinePortIdempotencyKey } from '../../reliable-messaging/ports';
import type { BusinessOperationReceipt } from '../../reliable-messaging/operation-receipt';
import { NotificationChannelType } from '../value-objects/notification-channel-type';
import { NotificationType } from '../value-objects/notification-type';
import { NotificationCategory } from '../value-objects/notification-category';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { UrgencyLevel } from '../../../shared/value-objects/urgency';

/** 跨模块共享 outbox 消息类型：NotificationRequested 信封。 */
export const NOTIFICATION_REQUESTED_MESSAGE_TYPE = 'notification.requested' as const;

/**
 * Notification content inputs carried by the envelope.
 * 信封携带的通知内容输入。
 */
export const NotificationContentInputSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  type: z.nativeEnum(NotificationType).optional(),
  category: z.nativeEnum(NotificationCategory).optional(),
});
export type NotificationContentInput = z.infer<typeof NotificationContentInputSchema>;

/**
 * Durable `NotificationRequested` envelope (ADR-063 §8).
 *
 * `suggestedChannels` is only a business preference: the final per-channel
 * plan is always decided by the Notification Policy at consumption time.
 *
 * 幂等三元组 (identityId/source/occurrenceKey) 与 idempotencyKey 对齐，
 * 与 W0 shared port 契约 (refinePortIdempotencyKey) 一致。
 */
export const NotificationRequestedSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('notification'),
    occurrenceKey: z.string().min(1),
    idempotencyKey: z.string().min(1),
    workflowKey: z.string().min(1),
    topic: z.string().optional(),
    relatedEntity: z
      .object({
        type: z.string().min(1),
        id: z.string().min(1),
      })
      .optional(),
    content: NotificationContentInputSchema,
    suggestedChannels: z.array(z.nativeEnum(NotificationChannelType)).optional(),
    importance: z.nativeEnum(ImportanceLevel).optional(),
    urgency: z.nativeEnum(UrgencyLevel).optional(),
    navigationIntent: z
      .object({
        route: z.string().min(1),
        params: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    correlationId: z.string().optional(),
    causationId: z.string().optional(),
    expiresAt: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type NotificationRequested = z.infer<typeof NotificationRequestedSchema>;

/**
 * Writer input for durable enqueueing of a NotificationRequested envelope.
 *
 * `operationId` is the outbox row id (distinct from the Fact id). The durable
 * row's correlation/causation chain falls back to the envelope's own
 * correlationId/causationId when present.
 */
export const NotificationRequestedOutboxInputSchema = z.object({
  operationId: z.string().min(1),
  envelope: NotificationRequestedSchema,
  correlationId: z.string().optional(),
  causationId: z.string().nullable().optional(),
});
export type NotificationRequestedOutboxInput = z.infer<
  typeof NotificationRequestedOutboxInputSchema
>;

/**
 * Writer port usable from domain handlers. The implementation writes the
 * envelope into the shared `outboxMessage` table transactionally (with the
 * handler's own commit when a txClient is supplied), never reaching into any
 * channel deliverer.
 */
export interface NotificationRequestedWriterPort {
  enqueueNotificationRequested(
    input: NotificationRequestedOutboxInput,
    options?: { txClient?: unknown },
  ): Promise<BusinessOperationReceipt>;
}