import type {
  CleanupOldNotificationsReq,
  DeleteNotificationsBatchReq,
  NotificationCategory,
  NotificationClientDTO,
} from '@memoflow/contracts/notification';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import { toNotificationClientDTO } from '../use-cases/commands/notification-dto-converters';
import type { INotificationRepository } from '../../domain/repositories';

interface CleanupOldNotificationsCommand extends CleanupOldNotificationsReq {
  identityId: string;
}

interface DeleteNotificationsBatchCommand extends DeleteNotificationsBatchReq {
  identityId: string;
}

export class NotificationMaintenanceApplicationService {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async markAsUnread(id: string, identityId: string): Promise<Result<NotificationClientDTO>> {
    return this.mutateLifecycle(id, identityId, (notification) => notification.markAsUnread());
  }

  async archive(id: string, identityId: string): Promise<Result<NotificationClientDTO>> {
    return this.mutateLifecycle(id, identityId, (notification) => notification.archive());
  }

  async restore(id: string, identityId: string): Promise<Result<NotificationClientDTO>> {
    return this.mutateLifecycle(id, identityId, (notification) => notification.restore());
  }

  private async mutateLifecycle(
    id: string,
    identityId: string,
    mutate: (notification: NonNullable<Awaited<ReturnType<INotificationRepository['findByIdForIdentity']>>>) => void,
  ): Promise<Result<NotificationClientDTO>> {
    const notification = await this.notificationRepository.findByIdForIdentity(identityId, id);
    if (!notification) return fail({ code: 'NOT_FOUND', message: 'notification not found' });
    mutate(notification);
    await this.notificationRepository.save(notification);
    return ok(toNotificationClientDTO(notification.toServerDTO()));
  }

  async deleteNotification(id: string, identityId: string): Promise<Result<void>> {
    const notification = await this.notificationRepository.findByIdForIdentity(identityId, id);
    if (!notification) {
      return fail({ code: 'NOT_FOUND', message: 'notification not found' });
    }

    notification.softDelete();
    await this.notificationRepository.save(notification);

    return ok(undefined);
  }

  async batchDelete(
    data: DeleteNotificationsBatchCommand,
  ): Promise<Result<{ deletedCount: number }>> {
    const notifications = await Promise.all(
      data.notificationIds.map((id) =>
        this.notificationRepository.findByIdForIdentity(data.identityId, id),
      ),
    );
    const existingNotifications = notifications.filter(
      (notification): notification is NonNullable<typeof notification> => notification !== null,
    );

    for (const notification of existingNotifications) {
      notification.softDelete();
    }

    await this.notificationRepository.saveMany(existingNotifications);

    return ok({
      deletedCount: existingNotifications.length,
    });
  }

  async cleanupOldNotifications(
    data: CleanupOldNotificationsCommand,
  ): Promise<Result<{ deletedCount: number }>> {
    const beforeTimestamp = Date.now() - data.beforeDays * 24 * 60 * 60 * 1000;
    const notifications = await this.notificationRepository.findByIdentityId(data.identityId, {
      includeDeleted: false,
      includeRead: true,
    });
    const expiredIds = notifications
      .map((notification) => notification.toServerDTO())
      .filter((notification) => this.matchesCategory(notification.category, data.category))
      .filter((notification) => notification.expiresAt != null && notification.expiresAt < beforeTimestamp)
      .map((notification) => String(notification.id));

    if (expiredIds.length > 0) {
      await this.notificationRepository.deleteMany(data.identityId, expiredIds);
    }

    return ok({
      deletedCount: expiredIds.length,
    });
  }

  private matchesCategory(
    actualCategory: NotificationCategory,
    expectedCategory?: NotificationCategory,
  ): boolean {
    return !expectedCategory || actualCategory === expectedCategory;
  }
}
