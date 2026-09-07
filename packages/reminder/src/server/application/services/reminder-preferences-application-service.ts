import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { UpdateReminderPreferencesReq } from '@memoflow/contracts/reminder';
import { UserReminderPreferences } from '../../domain/aggregates/user-reminder-preferences';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import type { IUserReminderPreferenceRepository } from '../../domain/repositories/i-user-reminder-preference-repository';

export interface ReminderPreferencesApplicationServiceDependencies {
  readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  readonly reminderDomainService: ReminderDomainService;
}

export class ReminderPreferencesApplicationService {
  private readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  private readonly reminderDomainService: ReminderDomainService;

  constructor(dependencies: ReminderPreferencesApplicationServiceDependencies) {
    this.userReminderPreferenceRepository = dependencies.userReminderPreferenceRepository;
    this.reminderDomainService = dependencies.reminderDomainService;
  }

  async getPreferences(ctx: ExecutionContext): Promise<Result<ReturnType<UserReminderPreferences['toClientDTO']>>> {
    const preferences = await this.userReminderPreferenceRepository.findByIdentityId(ctx.identityId);

    return ok(
      preferences?.toClientDTO() ??
        UserReminderPreferences.create({ identityId: ctx.identityId }).toClientDTO(),
    );
  }

  async updatePreferences(
    data: UpdateReminderPreferencesReq,
    ctx: ExecutionContext,
  ): Promise<Result<ReturnType<UserReminderPreferences['toClientDTO']>>> {
    const existing = await this.userReminderPreferenceRepository.findByIdentityId(ctx.identityId);

    if (!existing) {
      const preferences = UserReminderPreferences.create({ identityId: ctx.identityId });
      if (data.bestTimeSlots || data.worstTimeSlots) {
        preferences.updateTimeSlots(data.bestTimeSlots ?? [], data.worstTimeSlots ?? []);
      }
      if (data.globalReminderEnabled !== undefined) {
        preferences.toggleGlobalReminderEnabled(data.globalReminderEnabled);
      }
      await this.userReminderPreferenceRepository.save(preferences);
      await this.reminderDomainService.syncTemplatesEffectiveEnabledByIdentity(ctx.identityId);
      return ok(preferences.toClientDTO());
    }

    if (data.bestTimeSlots || data.worstTimeSlots) {
      existing.updateTimeSlots(data.bestTimeSlots ?? [], data.worstTimeSlots ?? []);
    }
    if (data.globalReminderEnabled !== undefined) {
      existing.toggleGlobalReminderEnabled(data.globalReminderEnabled);
    }

    await this.userReminderPreferenceRepository.save(existing);
    await this.reminderDomainService.syncTemplatesEffectiveEnabledByIdentity(ctx.identityId);

    return ok(existing.toClientDTO());
  }
}
