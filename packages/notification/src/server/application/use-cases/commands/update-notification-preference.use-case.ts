import type {
  NotificationChannelType,
  NotificationPreferenceClientDTO,
  UpdateNotificationPreferenceReq,
} from '@memoflow/contracts/notification';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { INotificationPreferenceRepository } from '../../../domain/repositories';
import { QuietHours } from '../../../domain/value-objects/quiet-hours';
import { asHm } from '@memoflow/time';
import { toNotificationPreferenceClientDTO } from './notification-dto-converters';

export class UpdateNotificationPreferenceUseCase {
  constructor(private readonly preferenceRepository: INotificationPreferenceRepository) {}

  async execute(
    identityId: string,
    input: UpdateNotificationPreferenceReq,
  ): Promise<Result<NotificationPreferenceClientDTO>> {
    if (!identityId) return error('BAD_REQUEST', 'identityId is required');
    const preference = await this.preferenceRepository.getOrCreate(identityId);

    for (const [channel, enabled] of Object.entries(input.globalChannels ?? {})) {
      if (enabled !== undefined) {
        preference.setGlobalChannel(channel as NotificationChannelType, enabled);
      }
    }
    for (const [workflowKey, channels] of Object.entries(input.workflowOverrides ?? {})) {
      for (const [channel, enabled] of Object.entries(channels)) {
        if (enabled !== undefined) {
          preference.setWorkflowChannelOverride(
            workflowKey,
            channel as NotificationChannelType,
            enabled,
          );
        }
      }
    }
    if (input.quietHours !== undefined) {
      preference.setQuietHours(
        input.quietHours
          ? QuietHours.create({
              ...input.quietHours,
              weeklyWindows: input.quietHours.weeklyWindows.map((window) => ({
                ...window,
                start: asHm(window.start),
                end: asHm(window.end),
              })),
            })
          : null,
      );
    }

    await this.preferenceRepository.save(preference);
    return ok(toNotificationPreferenceClientDTO(preference.toServerDTO()));
  }
}
