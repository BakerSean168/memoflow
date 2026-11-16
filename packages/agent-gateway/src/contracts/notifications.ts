import { z } from 'zod';
import { NotificationCategory, NotificationType } from '@memoflow/notification-contracts';
import { ImportanceLevel, UrgencyLevel } from '@memoflow/shared-primitives';

/**
 * Characters of a notification body projected to an external agent. Longer
 * bodies are cut and flagged, never streamed whole into an MCP response.
 */
export const NOTIFICATION_CONTENT_LIMIT = 2000;
/** Notification titles are labels, not bodies: projected as a bounded prefix. */
export const NOTIFICATION_TITLE_LIMIT = 500;
/** Hard page bounds: page ≤ 20 and limit ≤ 50 keep one call under 1000 rows. */
export const NOTIFICATION_PAGE_MAX = 20;
export const NOTIFICATION_LIMIT_MAX = 50;

/** Owner output is untrusted shape: parse the whitelisted source fields only. */
const NotificationFactSourceSchema = z.object({
  id: z.string().min(1),
  workflowKey: z.string().min(1),
  topic: z.string().min(1),
  title: z.string(),
  content: z.string(),
  type: z.enum(NotificationType),
  category: z.enum(NotificationCategory),
  importance: z.enum(ImportanceLevel),
  urgency: z.enum(UrgencyLevel),
  isRead: z.boolean(),
  readAt: z.number().int().nullable().optional(),
  archivedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  version: z.number().int().nonnegative(),
  relatedEntityType: z.string().min(1).nullable().optional(),
  relatedEntityId: z.string().min(1).nullable().optional(),
});

/**
 * External Notification Fact. Deliberately absent: identityId, idempotencyKey,
 * correlation/causation ids, metadata, action handles (execute-action is not
 * published), navigation intents, delivery state and soft-delete markers.
 */
export const ExternalNotificationSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    workflowKey: z.string().min(1).max(200),
    topic: z.string().min(1).max(200),
    title: z.string().max(500),
    content: z.string().max(NOTIFICATION_CONTENT_LIMIT),
    contentTruncated: z.boolean(),
    type: z.enum(NotificationType),
    category: z.enum(NotificationCategory),
    importance: z.enum(ImportanceLevel),
    urgency: z.enum(UrgencyLevel),
    isRead: z.boolean(),
    readAt: z.number().int().nullable(),
    archivedAt: z.number().int().nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
    version: z.number().int().nonnegative(),
    relatedEntityType: z.string().max(120).nullable(),
    relatedEntityId: z.string().max(200).nullable(),
  })
  .strict();
export type ExternalNotification = z.infer<typeof ExternalNotificationSchema>;

/** Parses owner output into the bounded whitelist projection. */
export function projectNotificationFact(raw: unknown): ExternalNotification {
  const fact = NotificationFactSourceSchema.parse(raw);
  const content = fact.content.slice(0, NOTIFICATION_CONTENT_LIMIT);
  return ExternalNotificationSchema.parse({
    id: fact.id,
    workflowKey: fact.workflowKey,
    topic: fact.topic,
    title: fact.title.slice(0, NOTIFICATION_TITLE_LIMIT),
    content,
    contentTruncated: content.length < fact.content.length,
    type: fact.type,
    category: fact.category,
    importance: fact.importance,
    urgency: fact.urgency,
    isRead: fact.isRead,
    readAt: fact.readAt ?? null,
    archivedAt: fact.archivedAt,
    createdAt: fact.createdAt,
    updatedAt: fact.updatedAt,
    version: fact.version,
    relatedEntityType: fact.relatedEntityType ?? null,
    relatedEntityId: fact.relatedEntityId ?? null,
  });
}

/** Offset paging is owner-provided; the gateway only bounds page and limit. */
export const NotificationListInputSchema = z.strictObject({
  isRead: z.boolean().optional(),
  category: z.enum(NotificationCategory).optional(),
  type: z.enum(NotificationType).optional(),
  archiveState: z.enum(['active', 'archived', 'all']).default('active'),
  keyword: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(NOTIFICATION_PAGE_MAX).default(1),
  limit: z.number().int().min(1).max(NOTIFICATION_LIMIT_MAX).default(20),
});
export const NotificationListOutputSchema = z.strictObject({
  items: z.array(ExternalNotificationSchema).max(NOTIFICATION_LIMIT_MAX),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1).max(NOTIFICATION_PAGE_MAX),
  pageSize: z.number().int().min(1).max(NOTIFICATION_LIMIT_MAX),
  hasMore: z.boolean(),
  truncated: z.literal('response-budget').optional(),
});
export const NotificationUnreadCountOutputSchema = z.strictObject({
  count: z.number().int().nonnegative(),
});
export const NotificationMarkReadInputSchema = z.strictObject({
  id: z.string().min(1).max(100),
});
/** Idempotent state transition receipt: no owner read model, no action handles. */
export const NotificationMarkReadOutputSchema = z.strictObject({
  id: z.string().min(1).max(100),
  isRead: z.literal(true),
  readAt: z.number().int().nullable(),
  version: z.number().int().nonnegative(),
  updatedAt: z.number().int(),
});
export type NotificationMarkReadReceipt = z.infer<typeof NotificationMarkReadOutputSchema>;
