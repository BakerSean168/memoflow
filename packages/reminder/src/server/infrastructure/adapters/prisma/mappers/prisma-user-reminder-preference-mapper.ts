/**
 * Prisma UserReminderPreference Mapper
 *
 * Maps between UserReminderPreferences domain aggregate and Prisma model.
 */

import type { UserReminderPreference as PrismaUserReminderPreference } from '@memoflow/database';
import type { TimeSlotDTO } from '@memoflow/contracts/reminder';
import { UserReminderPreferences } from '../../../../domain/aggregates/user-reminder-preferences';
import type { IdentityId } from '@memoflow/domain-shared';

export class PrismaUserReminderPreferenceMapper {
  /**
   * Prisma record → UserReminderPreferences aggregate root
   */
  static toDomain(data: PrismaUserReminderPreference): UserReminderPreferences {
    return UserReminderPreferences.load({
      id: data.id,
      identityId: data.identityId as IdentityId,
      bestTimeSlots: JSON.parse(data.bestTimeSlots ?? '[]') as TimeSlotDTO[],
      worstTimeSlots: JSON.parse(data.worstTimeSlots ?? '[]') as TimeSlotDTO[],
      globalReminderEnabled: data.globalReminderEnabled ?? true,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
