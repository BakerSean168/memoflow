import { z } from 'zod';

/** External Notification reads expose the notification fact without private identity/audit links. */
export const ExternalNotificationSchema = z.strictObject({
  id: z.string().min(1).max(64),
  workflowKey: z.string(),
  topic: z.string(),
  title: z.string(),
  content: z.string(),
  type: z.string(),
  category: z.string(),
  importance: z.string(),
  urgency: z.string(),
  isRead: z.boolean(),
  readAt: z.union([z.string(), z.number()]).nullable().optional(),
  createdAt: z.union([z.string(), z.number()]),
  updatedAt: z.union([z.string(), z.number()]),
  expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
  relatedEntityType: z.string().nullable().optional(),
  relatedEntityId: z.string().nullable().optional(),
  version: z.number().int().nonnegative().optional(),
});
export type ExternalNotification = z.infer<typeof ExternalNotificationSchema>;

export const NotificationGetInputSchema = z.strictObject({
  id: z.string().min(1).max(64),
});
export const NotificationGetOutputSchema = z.strictObject({
  notification: ExternalNotificationSchema,
});

export const NotificationListInputSchema = z.strictObject({
  isRead: z.boolean().optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().max(2048).optional(),
});
export const NotificationListOutputSchema = z.strictObject({
  items: z.array(ExternalNotificationSchema).max(50),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});

export const NotificationUnreadCountInputSchema = z.strictObject({});
export const NotificationUnreadCountOutputSchema = z.strictObject({
  unreadCount: z.number().int().nonnegative(),
});
