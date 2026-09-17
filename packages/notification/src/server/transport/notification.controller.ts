/** Product Notification controller shared by HTTP and IPC transports. */
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type { NotificationInboxPort } from '../application';
import { NotificationQuerySchema } from '@memoflow/contracts/notification';
import type {
  CleanupOldNotificationsReq,
  CreateNotificationReq,
  DeleteNotificationsBatchReq,
  ExecuteNotificationActionRes,
  MarkAsReadBatchReq,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';
import { formatZodErrors } from '@memoflow/utils/result';

export class NotificationController {
  constructor(private readonly inbox: NotificationInboxPort) {}

  async create(input: CreateNotificationReq, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.createNotification({ ...input, identityId: ctx.identityId });
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
    return this.inbox.listNotifications({ ...parsed.data, identityId: ctx.identityId });
  }

  async get(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.getNotification(id, ctx.identityId);
  }

  async delete(id: string, ctx: Context): Promise<Result<null>> {
    const result = await this.inbox.deleteNotification(id, ctx.identityId);
    if (!result.ok) return result as Result<null>;
    return ok(null);
  }

  async markAsRead(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.markAsRead(id, ctx.identityId);
  }

  async markAsUnread(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.markAsUnread(id, ctx.identityId);
  }

  async archive(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.archive(id, ctx.identityId);
  }

  async restore(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.inbox.restore(id, ctx.identityId);
  }

  async markAllAsRead(identityId: string): Promise<Result<{ count: number }>> {
    const result = await this.inbox.markAllAsRead(identityId);
    if (!result.ok) return result as Result<{ count: number }>;
    const count = typeof result.data === 'number' ? result.data : 0;
    return ok({ count });
  }

  async getUnreadCount(identityId: string): Promise<Result<unknown>> {
    return this.inbox.getUnreadCount(identityId);
  }

  async batchMarkAsRead(
    input: MarkAsReadBatchReq,
    ctx: Context,
  ): Promise<Result<{ updatedCount: number }>> {
    const result = await this.inbox.batchMarkAsRead(input, ctx.identityId);
    if (!result.ok) return result as Result<{ updatedCount: number }>;
    const updatedCount = typeof result.data === 'number' ? result.data : 0;
    return ok({ updatedCount });
  }

  async batchDelete(
    input: DeleteNotificationsBatchReq,
    ctx: Context,
  ): Promise<Result<{ deletedCount: number }>> {
    const result = await this.inbox.batchDelete(input, ctx.identityId);
    if (!result.ok) return result as Result<{ deletedCount: number }>;
    if (result.data && typeof result.data === 'object' && 'deletedCount' in result.data) {
      return ok({ deletedCount: Number((result.data as { deletedCount: number }).deletedCount) });
    }
    return ok({ deletedCount: 0 });
  }

  async cleanup(
    input: CleanupOldNotificationsReq,
    ctx: Context,
  ): Promise<Result<{ deletedCount: number }>> {
    const result = await this.inbox.cleanupOldNotifications({
      ...input,
      identityId: ctx.identityId,
    });
    if (!result.ok) return result as Result<{ deletedCount: number }>;
    if (result.data && typeof result.data === 'object' && 'deletedCount' in result.data) {
      return ok({ deletedCount: Number((result.data as { deletedCount: number }).deletedCount) });
    }
    return ok({ deletedCount: 0 });
  }

  async getPreferences(ctx: Context): Promise<Result<unknown>> {
    return this.inbox.getPreferences(ctx.identityId);
  }

  async updatePreferences(
    input: UpdateNotificationPreferenceReq,
    ctx: Context,
  ): Promise<Result<unknown>> {
    return this.inbox.updatePreferences(input, ctx.identityId);
  }

  async executeAction(
    notificationId: string,
    actionKey: string,
    ctx: Context,
  ): Promise<Result<ExecuteNotificationActionRes>> {
    return this.inbox.executeAction(notificationId, actionKey, ctx.identityId);
  }
}
