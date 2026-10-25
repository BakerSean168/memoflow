/**
 * Notification Batch Operations
 *
 * This file contains DTOs for batch operations on notifications.
 * Includes marking multiple notifications as read, deleting in bulk, and cleanup operations.
 */

import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { NotificationId } from '@memoflow/shared-primitives';
import type { BatchOperationResultDTO } from '../dtos/batch-result.dto';
import { NotificationCategory } from '../value-objects/notification-category';

// ============================================================================
// BATCH Operations
// ============================================================================

/** Residual 671: shared notification id-batch request (mark-read + batch-delete). */
// Residual 799: Mark/Delete/Cleanup *Res reuse BatchOperationResultDTO = z.infer of NotificationBatchResultSchema.

export const NotificationIdsBatchSchema = z.object({
  notificationIds: z.array(brandedId<NotificationId>()).min(1),
});

export type MarkAsReadBatchReq = z.infer<typeof NotificationIdsBatchSchema>;
export type MarkAsReadBatchRes = BatchOperationResultDTO;

export type DeleteNotificationsBatchReq = z.infer<typeof NotificationIdsBatchSchema>;
export type DeleteNotificationsBatchRes = BatchOperationResultDTO;

export const CleanupOldNotificationsSchema = z.object({
  beforeDays: z.number().int().min(1),
  category: z.enum(NotificationCategory).optional(),
});

export type CleanupOldNotificationsReq = z.infer<typeof CleanupOldNotificationsSchema>;
export type CleanupOldNotificationsRes = BatchOperationResultDTO;
