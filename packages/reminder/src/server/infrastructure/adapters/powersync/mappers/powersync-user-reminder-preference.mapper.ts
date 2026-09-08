import type { TimeSlotDTO } from '@memoflow/contracts/reminder';
import { UserReminderPreferences } from '../../../../domain/aggregates/user-reminder-preferences';
import type { IdentityId } from '@memoflow/domain-shared';

export type PowerSyncUserReminderPreferenceRow = {
  id: string;
  identity_id: string;
  best_time_slots: string | null;
  worst_time_slots: string | null;
  global_reminder_enabled: number | boolean;
  created_at: string;
  updated_at: string;
};

export class PowerSyncUserReminderPreferenceMapper {
  static toDomain(data: PowerSyncUserReminderPreferenceRow): UserReminderPreferences {
    return UserReminderPreferences.load({
      id: data.id,
      identityId: data.identity_id as IdentityId,
      bestTimeSlots: JSON.parse(data.best_time_slots ?? '[]') as TimeSlotDTO[],
      worstTimeSlots: JSON.parse(data.worst_time_slots ?? '[]') as TimeSlotDTO[],
      globalReminderEnabled:
        data.global_reminder_enabled === true || data.global_reminder_enabled === 1,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    });
  }
}
