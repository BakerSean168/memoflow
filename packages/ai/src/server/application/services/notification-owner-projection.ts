import { NotificationActionIntentSchema } from '@memoflow/contracts/notification';
import type {
  AINotificationActionReceipt,
  AINotificationFactProjection,
} from '../ports/notification-read.port';
import { z } from 'zod';

const NotificationFactSchema = z
  .object({
    id: z.string().min(1),
    workflowKey: z.string().min(1),
    topic: z.string().min(1),
    title: z.string(),
    content: z.string(),
    importance: z.string().min(1),
    urgency: z.string().min(1),
    relatedEntityType: z.string().min(1).nullable().optional(),
    relatedEntityId: z.string().min(1).nullable().optional(),
    navigationIntent: z
      .object({
        route: z.string().min(1),
        params: z.record(z.string(), z.string()).optional(),
      })
      .nullable()
      .optional(),
    actions: z.array(NotificationActionIntentSchema).nullable().optional(),
    readAt: z.number().nullable().optional(),
    archivedAt: z.number().nullable(),
    createdAt: z.number(),
  })
  .passthrough();

const NotificationInboxPageSchema = z.object({
  notifications: z.array(NotificationFactSchema),
});

const NotificationActionResultSchema = z.object({
  interaction: z.object({
    id: z.string().min(1),
    notificationId: z.string().min(1),
    actionKey: z.string().min(1),
    actionKind: z.enum(['navigate', 'owner-command', 'archive']),
    outcome: z.enum(['accepted', 'rejected', 'failed']),
    commandReceiptId: z.string().nullable().optional(),
  }),
  action: NotificationActionIntentSchema,
});

export function projectNotificationFact(raw: unknown): AINotificationFactProjection {
  const fact = NotificationFactSchema.parse(raw);
  return {
    id: fact.id,
    workflowKey: fact.workflowKey,
    topicKey: fact.topic,
    title: fact.title,
    content: fact.content,
    presentation: {
      importance: fact.importance,
      urgency: fact.urgency,
    },
    subjectRef:
      fact.relatedEntityType != null && fact.relatedEntityId != null
        ? { type: fact.relatedEntityType, id: fact.relatedEntityId }
        : null,
    navigationIntent: fact.navigationIntent
      ? {
          route: fact.navigationIntent.route,
          ...(fact.navigationIntent.params ? { params: fact.navigationIntent.params } : {}),
        }
      : null,
    actions: fact.actions ?? [],
    readAt: fact.readAt ?? null,
    archivedAt: fact.archivedAt,
    createdAt: fact.createdAt,
  };
}

export function projectNotificationInboxPage(raw: unknown): AINotificationFactProjection[] {
  const page = NotificationInboxPageSchema.parse(raw);
  return page.notifications.map(projectNotificationFact);
}

export function projectNotificationAction(raw: unknown): AINotificationActionReceipt {
  const result = NotificationActionResultSchema.parse(raw);
  return {
    id: result.interaction.id,
    notificationId: result.interaction.notificationId,
    actionKey: result.interaction.actionKey,
    actionKind: result.interaction.actionKind,
    outcome: result.interaction.outcome,
    commandReceiptId: result.interaction.commandReceiptId ?? null,
  };
}
