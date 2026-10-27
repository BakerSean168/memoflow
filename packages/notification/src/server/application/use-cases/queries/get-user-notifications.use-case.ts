/**
 * Get User Notifications Service
 *
 * 获取用户通知的应用服务
 */

import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type { INotificationRepository } from '../../../domain/repositories';
import { toNotificationClientDTO } from '../commands/notification-dto-converters';

/**
 * Get User Notifications Use Case
 */
export class GetUserNotificationsUseCase {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async execute(
    identityId: string,
    options?: { includeRead?: boolean; limit?: number; offset?: number },
  ): Promise<Result<NotificationClientDTO[]>> {
    const notifications = await this.notificationRepository.findByIdentityId(identityId, {
      includeRead: options?.includeRead ?? true,
      includeDeleted: false,
      limit: options?.limit,
      offset: options?.offset,
    });
    return ok(notifications.map((n) => toNotificationClientDTO(n.toServerDTO())));
  }
}
