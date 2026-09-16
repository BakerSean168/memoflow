/**
 * Notification Controller
 *
 * Encapsulates Zod validation and use case orchestration.
 * Shared by both Express (HTTP) and IPC transport layers.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type { NotificationApplicationPort } from '../application';
import { NotificationQuerySchema } from '@memoflow/contracts/notification';
import type {
  CleanupOldNotificationsReq,
  CreateNotificationReq,
  DeleteNotificationsBatchReq,
  MarkAsReadBatchReq,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';
import { formatZodErrors } from '@memoflow/utils/result';

export class NotificationController {
  constructor(private readonly useCases: NotificationApplicationPort) {}

  // ==================== CRUD Operations ====================

  async create(input: CreateNotificationReq, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.createNotification({
      ...input,
      identityId: ctx.identityId,
    });
  }

  async list(query: Record<string, unknown>, ctx: Context): Promise<Result<unknown>> {
    const parsed = NotificationQuerySchema.safeParse(query);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.listNotifications({
      ...parsed.data,
      identityId: ctx.identityId,
    });
  }

  async get(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.getNotification(id, ctx.identityId);
  }

  async delete(id: string, ctx: Context): Promise<Result<null>> {
    const result = await this.useCases.deleteNotification(id, ctx.identityId);
    if (!result.ok) return result as Result<null>;
    // Serialize as data:null (no ActionResult / undefined dual-track).
    return ok(null);
  }

  // ==================== Read/Batch Operations ====================

  async markAsRead(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.markAsRead(id, ctx.identityId);
  }

  async markAsUnread(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.markAsUnread(id, ctx.identityId);
  }

  async archive(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.archive(id, ctx.identityId);
  }

  async restore(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.restore(id, ctx.identityId);
  }

  async markAllAsRead(identityId: string): Promise<Result<{ count: number }>> {
    const result = await this.useCases.markAllAsRead(identityId);
    if (!result.ok) return result as Result<{ count: number }>;
    // Align bare number Result with UnreadCountResponseSchema { count }.
    const count = typeof result.data === 'number' ? result.data : 0;
    return ok({ count });
  }

  async getUnreadCount(identityId: string): Promise<Result<unknown>> {
    return this.useCases.getUnreadCount(identityId);
  }

  async batchMarkAsRead(
    input: MarkAsReadBatchReq,
    ctx: Context,
  ): Promise<Result<{ updatedCount: number }>> {
    const result = await this.useCases.batchMarkAsRead(input, ctx.identityId);
    if (!result.ok) return result as Result<{ updatedCount: number }>;
    // Align bare number Result with NotificationBatchResultSchema { updatedCount }.
    const updatedCount = typeof result.data === 'number' ? result.data : 0;
    return ok({ updatedCount });
  }

  async batchDelete(
    input: DeleteNotificationsBatchReq,
    ctx: Context,
  ): Promise<Result<{ deletedCount: number }>> {
    const result = await this.useCases.batchDelete(input, ctx.identityId);
    if (!result.ok) return result as Result<{ deletedCount: number }>;
    // Normalize to BatchOperationResultDTO (no { success, affected } dual-track).
    if (
      result.data &&
      typeof result.data === 'object' &&
      'deletedCount' in (result.data as object)
    ) {
      return ok({ deletedCount: Number((result.data as { deletedCount: number }).deletedCount) });
    }
    return ok({ deletedCount: 0 });
  }

  async cleanup(
    input: CleanupOldNotificationsReq,
    ctx: Context,
  ): Promise<Result<{ deletedCount: number }>> {
    const result = await this.useCases.cleanupOldNotifications({
      ...input,
      identityId: ctx.identityId,
    });
    if (!result.ok) return result as Result<{ deletedCount: number }>;
    if (
      result.data &&
      typeof result.data === 'object' &&
      'deletedCount' in (result.data as object)
    ) {
      return ok({ deletedCount: Number((result.data as { deletedCount: number }).deletedCount) });
    }
    return ok({ deletedCount: 0 });
  }

  // ==================== Preference Operations (residual 196) ====================

  async getPreferences(ctx: Context): Promise<Result<unknown>> {
    return this.useCases.getPreferences(ctx.identityId);
  }

  async updatePreferences(
    input: UpdateNotificationPreferenceReq,
    ctx: Context,
  ): Promise<Result<unknown>> {
    // identityId always from auth context — never from client body dual-track.
    return this.useCases.updatePreferences(input, ctx.identityId);
  }

  // ==================== Dead-Letter & Receipt Operations ====================

  async queryDeadLetters(ctx: Context): Promise<Result<unknown>> {
    return this.useCases.queryDeadLetters(ctx.identityId);
  }

  async replayDeadLetter(operationId: string, ctx: Context): Promise<Result<unknown>> {
    return this.useCases.replayDeadLetter(operationId, ctx.identityId);
  }

  async getDeliveryReceipts(
    ctx: Context,
    query?: { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<Result<unknown>> {
    return this.useCases.getDeliveryReceipts(ctx.identityId, query);
  }

  async getOperationTimeline(
    ctx: Context,
    query?: { status?: string; limit?: number },
  ): Promise<Result<unknown>> {
    return this.useCases.getOperationTimeline(ctx.identityId, query);
  }

  async getOperationAudit(
    ctx: Context,
    query?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<unknown>> {
    return this.useCases.getOperationAudit(ctx.identityId, query);
  }
}
