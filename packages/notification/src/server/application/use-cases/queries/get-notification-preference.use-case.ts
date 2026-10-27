/**
 * Get Notification Preference Service
 *
 * 获取通知偏好设置的应用服务
 */

import { NotificationPreferenceDomainService } from '../../../domain/services/notification-preference-domain-service';
import type { NotificationPreferenceClientDTO } from '@memoflow/notification-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type { INotificationPreferenceRepository } from '../../../domain/repositories/i-notification-preference-repository';
import { toNotificationPreferenceClientDTO } from '../commands/notification-dto-converters';

/**
 * Get Notification Preference Use Case
 */
export class GetNotificationPreferenceUseCase {
  private preferenceService: NotificationPreferenceDomainService;

  constructor(private readonly preferenceRepository: INotificationPreferenceRepository) {
    this.preferenceService = new NotificationPreferenceDomainService(preferenceRepository);
  }

  async execute(identityId: string): Promise<Result<NotificationPreferenceClientDTO | null>> {
    const preference = await this.preferenceService.getPreference(identityId);
    return ok(preference ? toNotificationPreferenceClientDTO(preference.toServerDTO()) : null);
  }

  async executeOrCreate(identityId: string): Promise<Result<NotificationPreferenceClientDTO>> {
    const preference = await this.preferenceService.getOrCreatePreference(identityId);
    return ok(toNotificationPreferenceClientDTO(preference.toServerDTO()));
  }
}
