import { z } from 'zod';
import type { NotificationActionIntent } from '../value-objects/notification-action';
import type { NotificationInteractionDTO } from '../entities/notification-interaction';

const JsonValueSchema = z.json();

export const NotificationEntityRefSchema = z.object({
  type: z.string().trim().min(1).max(120),
  id: z.string().trim().min(1).max(500),
});

const ActionBaseSchema = z.object({
  actionKey: z.string().trim().min(1).max(200),
  labelKey: z.string().trim().min(1).max(200),
});

export const NotificationNavigationIntentSchema = z.object({
  route: z.string().trim().min(1).max(500),
  params: z.record(z.string(), z.string()).optional(),
});

export const NotificationActionIntentSchema = z.discriminatedUnion('kind', [
  ActionBaseSchema.extend({
    kind: z.literal('navigate'),
    destination: NotificationNavigationIntentSchema,
  }),
  ActionBaseSchema.extend({
    kind: z.literal('owner-command'),
    owner: NotificationEntityRefSchema,
    commandKey: z.string().trim().min(1).max(200),
    input: JsonValueSchema.optional(),
  }),
  ActionBaseSchema.extend({
    kind: z.literal('archive'),
  }),
]) satisfies z.ZodType<NotificationActionIntent>;

export const ExecuteNotificationActionSchema = z.object({
  notificationId: z.string().min(1),
  actionKey: z.string().trim().min(1).max(200),
});

export type ExecuteNotificationActionReq = z.infer<typeof ExecuteNotificationActionSchema>;

export const NotificationInteractionResponseSchema = z.object({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  identityId: z.string().min(1),
  notificationId: z.string().min(1),
  actionKey: z.string().min(1),
  actionKind: z.enum(['navigate', 'owner-command', 'archive']),
  occurredAt: z.number(),
  commandReceiptId: z.string().nullable().optional(),
  outcome: z.enum(['accepted', 'rejected', 'failed']),
  correlationId: z.string().nullable().optional(),
  causationId: z.string().nullable().optional(),
});

export const ExecuteNotificationActionResponseSchema = z.object({
  interaction: NotificationInteractionResponseSchema,
  action: NotificationActionIntentSchema,
});

export interface ExecuteNotificationActionRes {
  interaction: NotificationInteractionDTO;
  action: NotificationActionIntent;
}
