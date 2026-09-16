/**
 * Notification - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type {
  IdentityId,
  NotificationId,
  NotificationPreferenceId,
  NotificationTemplateId,
} from '../../../primitives';
import { NotificationType } from '../value-objects/notification-type';
import { NotificationCategory } from '../value-objects/notification-category';
import { NotificationChannelType } from '../value-objects/notification-channel-type';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { UrgencyLevel } from '../../../shared/value-objects/urgency';
import { RelatedEntityType } from '../value-objects/related-entity-type';

/**
 * Notification Fact response schema. Delivery status is intentionally absent.
 */
export const NotificationResponseSchema = z.object({
  id: brandedId<NotificationId>(),
  identityId: brandedId<IdentityId>(),
  workflowKey: z.string(),
  topic: z.string(),
  idempotencyKey: z.string(),
  title: z.string(),
  content: z.string(),
  type: z.enum(NotificationType),
  category: z.enum(NotificationCategory),
  importance: z.enum(ImportanceLevel),
  urgency: z.enum(UrgencyLevel),
  relatedEntityType: z.enum(RelatedEntityType).nullable().optional(),
  relatedEntityId: z.string().nullable().optional(),
  navigationIntent: z.object({
    route: z.string(),
    params: z.record(z.string(), z.string()).optional(),
  }).nullable().optional(),
  correlationId: z.string().nullable().optional(),
  causationId: z.string().nullable().optional(),
  isRead: z.boolean(),
  readAt: z.number().nullable().optional(),
  expiresAt: z.number().nullable().optional(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  archivedAt: z.number().nullable(),
});

/**
 * BatchResult Schema
 * Residual 799: BatchOperationResultDTO dual retired — this schema is the sole batch-result shape
 * (semantic BatchOperationResultDTO is z.infer alias).
 */
export const NotificationBatchResultSchema = z.object({
  updatedCount: z.number().optional(),
  deletedCount: z.number().optional(),
});

/**
 * Unread Count Response Schema
 * Residual 801: UnreadCountResponse dual retired — this schema is the sole unread-count shape
 * (semantic UnreadCountResponse is z.infer alias owned here for contracts consumers).
 */
export const UnreadCountResponseSchema = z.object({
  count: z.number(),
});

// Residual 801: UnreadCountResponse dual retired from notification package port interface.
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// ============ Inferred response aliases ============
// ADR-047: the RPC map imports ONLY inferred types from `../api`; these aliases
// are the type surface the protocol layer references (no `z.infer` in maps).
// ADR-047：RPC map 只从 `../api` 导入推导类型；这些别名是 protocol 层引用的
// 类型表面（map 内不再出现 `z.infer`）。

export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
export type NotificationBatchResult = z.infer<typeof NotificationBatchResultSchema>;

/**
 * Notification Preference Response Schema (residual 196)
 *
 * Residual 829: NotificationPreferenceClientDTO dual retired — sole NotificationPreferenceResponseSchema + z.infer
 * (semantic type is z.infer alias in aggregates/notification-preference-client.ts).
 */
export const NotificationPreferenceResponseSchema = z.object({
  id: brandedId<NotificationPreferenceId>(),
  identityId: brandedId<IdentityId>(),
  globalChannels: z.partialRecord(z.enum(NotificationChannelType), z.boolean()),
  workflowOverrides: z.record(
    z.string(),
    z.partialRecord(z.enum(NotificationChannelType), z.boolean()),
  ),
  doNotDisturb: z.object({
    enabled: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    daysOfWeek: z.array(z.number()),
  }).nullable(),
  rateLimit: z.object({
    enabled: z.boolean(),
    maxPerHour: z.number(),
    maxPerDay: z.number(),
  }).nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// Residual 839: NotificationTemplateClientDTO dual retired — sole NotificationTemplateResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/notification-template-client.ts).
// Residual 845: NotificationTemplateServerDTO also z.infer of this schema (client+server single-track).
// Nested config matches NotificationTemplateConfigServerDTO shape.
export const NotificationTemplateContentSchema = z.object({
  title: z.string(),
  content: z.string(),
  variables: z.array(z.string()).optional(),
});

export const NotificationEmailTemplateContentSchema = z.object({
  subject: z.string(),
  htmlBody: z.string().nullable().optional(),
  textBody: z.string().nullable().optional(),
});

export const NotificationPushTemplateContentSchema = z.object({
  title: z.string(),
  body: z.string(),
  icon: z.string().nullable().optional(),
  sound: z.string().nullable().optional(),
});

export const NotificationChannelConfigSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
});

export const NotificationTemplateConfigSchema = z.object({
  template: NotificationTemplateContentSchema,
  channels: NotificationChannelConfigSchema,
  emailTemplate: NotificationEmailTemplateContentSchema.nullable().optional(),
  pushTemplate: NotificationPushTemplateContentSchema.nullable().optional(),
});

export const NotificationTemplateResponseSchema = z.object({
  id: brandedId<NotificationTemplateId>(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(NotificationType),
  category: z.enum(NotificationCategory),
  template: NotificationTemplateConfigSchema,
  isActive: z.boolean(),
  isSystemTemplate: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
