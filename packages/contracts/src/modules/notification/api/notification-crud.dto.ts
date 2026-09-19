import { z } from 'zod';
import { brandedId, openApiJsonValue } from '../../../primitives';
import type { NotificationServerDTO } from '../aggregates/notification-server';
import { NotificationType } from '../value-objects/notification-type';
import { NotificationCategory } from '../value-objects/notification-category';
import { NotificationChannelType } from '../value-objects/notification-channel-type';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { UrgencyLevel } from '../../../shared/value-objects/urgency';
import { NotificationActionIntentSchema } from './notification-action.dto';

export const CreateNotificationSchema = z.object({
  workflowKey: z.string().min(1).max(200).optional(),
  topic: z.string().min(1).max(200).optional(),
  idempotencyKey: z.string().min(1).max(500).optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  type: z.enum(NotificationType),
  category: z.enum(NotificationCategory),
  importance: z.enum(ImportanceLevel).optional(),
  urgency: z.enum(UrgencyLevel).optional(),
  relatedEntityType: z.string().trim().min(1).max(120).optional(),
  relatedEntityId: brandedId<string>().optional(),
  navigationIntent: z.object({ route: z.string(), params: z.record(z.string(), z.string()).optional() }).optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  actions: z.array(NotificationActionIntentSchema).optional(),
  metadata: z.record(z.string(), openApiJsonValue).optional(),
  expiresAt: z.number().int().optional(),
  sendImmediately: z.boolean().default(false).optional(),
  channels: z.array(z.enum(NotificationChannelType)).optional(),
});
export type CreateNotificationReq = z.infer<typeof CreateNotificationSchema>;
export type CreateNotificationRes = NotificationServerDTO;
