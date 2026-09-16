import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { NotificationListResultDTO } from '../dtos/notification-result.dto';
import { NotificationType } from '../value-objects/notification-type';
import { NotificationCategory } from '../value-objects/notification-category';
import { RelatedEntityType } from '../value-objects/related-entity-type';

export const NotificationQuerySchema = z.object({
  workflowKey: z.string().optional(),
  topic: z.string().optional(),
  type: z.enum(NotificationType).optional(),
  category: z.enum(NotificationCategory).optional(),
  isRead: z.boolean().optional(),
  archiveState: z.enum(['active', 'archived', 'all']).default('active').optional(),
  relatedEntityType: z.enum(RelatedEntityType).optional(),
  relatedEntityId: brandedId<string>().optional(),
  startDate: z.number().int().optional(),
  endDate: z.number().int().optional(),
  keyword: z.string().optional(),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'importance', 'urgency']).default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;
export type NotificationListRes = NotificationListResultDTO;
