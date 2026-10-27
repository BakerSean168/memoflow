/**
 * Get Unread Notifications Service
 *
 * 获取未读通知的应用服务
 */

import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type { INotificationRepository } from '../../../domain/repositories';
import { toNotificationClientDTO } from '../commands/notification-dto-converters';

/**
 * Get Unread Notifications Use Case
 */
export class GetUnreadNotificationsUseCase {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async execute(
    identityId: string,
    options?: { limit?: number },
  ): Promise<Result<NotificationClientDTO[]>> {
    const notifications = await this.notificationRepository.findUnread(identityId, options);
    return ok(notifications.map((n) => toNotificationClientDTO(n.toServerDTO())));
  }

  async getCount(identityId: string): Promise<Result<{ count: number }>> {
    const count = await this.notificationRepository.countUnread(identityId);
    return ok({ count });
  }
}
