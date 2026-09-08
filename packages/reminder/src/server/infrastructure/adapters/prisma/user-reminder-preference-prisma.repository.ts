/**
 * UserReminderPreferencePrismaRepository
 * Prisma implementation of IUserReminderPreferenceRepository
 *
 * 鑱氬悎鏍癸細UserReminderPreferences
 */

import type { PrismaClient, UserReminderPreference as PrismaUserReminderPreference } from '@memoflow/database';
import type { IUserReminderPreferenceRepository } from '../../../domain/repositories/i-user-reminder-preference-repository';
import { UserReminderPreferences } from '../../../domain/aggregates/user-reminder-preferences';
import { PrismaUserReminderPreferenceMapper } from './mappers/prisma-user-reminder-preference-mapper';

export class UserReminderPreferencePrismaRepository
  implements IUserReminderPreferenceRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Prisma record → UserReminderPreferences aggregate root
   */
  private mapToEntity(data: PrismaUserReminderPreference): UserReminderPreferences {
    return PrismaUserReminderPreferenceMapper.toDomain(data);
  }

  async save(preferences: UserReminderPreferences): Promise<void> {
    const dto = preferences.toServerDTO();

    await this.prisma.userReminderPreference.upsert({
      where: { identityId: dto.identityId },
      create: {
        id: dto.id,
        identityId: dto.identityId,
        bestTimeSlots: JSON.stringify(dto.bestTimeSlots),
        worstTimeSlots: JSON.stringify(dto.worstTimeSlots),
        globalReminderEnabled: dto.globalReminderEnabled,
      },
      update: {
        bestTimeSlots: JSON.stringify(dto.bestTimeSlots),
        worstTimeSlots: JSON.stringify(dto.worstTimeSlots),
        globalReminderEnabled: dto.globalReminderEnabled,
      },
    });
  }

  async findByIdentityId(
    identityId: string,
  ): Promise<UserReminderPreferences | null> {
    const data = await this.prisma.userReminderPreference.findUnique({
      where: { identityId },
    });
    return data ? this.mapToEntity(data) : null;
  }

  async delete(identityId: string): Promise<void> {
    await this.prisma.userReminderPreference.delete({
      where: { identityId },
    });
  }

  async exists(identityId: string): Promise<boolean> {
    const count = await this.prisma.userReminderPreference.count({
      where: { identityId },
    });
    return count > 0;
  }
}
