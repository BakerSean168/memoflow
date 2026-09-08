import type { IUserReminderPreferenceRepository } from '../../../domain/repositories/i-user-reminder-preference-repository';
import type { UserReminderPreferences } from '../../../domain/aggregates/user-reminder-preferences';
import {
  PowerSyncUserReminderPreferenceMapper,
  type PowerSyncUserReminderPreferenceRow,
} from './mappers/powersync-user-reminder-preference.mapper';

type Queryable = {
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
};

export class UserReminderPreferencePowerSyncRepository implements IUserReminderPreferenceRepository {
  constructor(private readonly db: Queryable) {}

  async save(preferences: UserReminderPreferences): Promise<void> {
    const dto = preferences.toServerDTO();
    const createdAt = new Date(dto.createdAt).toISOString();
    const updatedAt = new Date(dto.updatedAt).toISOString();
    const existing = await this.db.getOptional<{ identity_id: string }>(
      'SELECT identity_id FROM user_reminder_preferences WHERE identity_id = ? LIMIT 1',
      [dto.identityId],
    );

    if (existing) {
      await this.db.execute(
        `UPDATE user_reminder_preferences
         SET best_time_slots = ?,
             worst_time_slots = ?,
             global_reminder_enabled = ?,
             updated_at = ?
          WHERE identity_id = ?`,
        [
          JSON.stringify(dto.bestTimeSlots ?? []),
          JSON.stringify(dto.worstTimeSlots ?? []),
          dto.globalReminderEnabled ? 1 : 0,
          updatedAt,
          dto.identityId,
        ],
      );
    } else {
      await this.db.execute(
        `INSERT INTO user_reminder_preferences (
          id, identity_id, best_time_slots, worst_time_slots, global_reminder_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.id,
          dto.identityId,
          JSON.stringify(dto.bestTimeSlots ?? []),
          JSON.stringify(dto.worstTimeSlots ?? []),
          dto.globalReminderEnabled ? 1 : 0,
          createdAt,
          updatedAt,
        ],
      );
    }
  }

  async findByIdentityId(identityId: string): Promise<UserReminderPreferences | null> {
    const row = await this.db.getOptional<PowerSyncUserReminderPreferenceRow>(
      'SELECT * FROM user_reminder_preferences WHERE identity_id = ? LIMIT 1',
      [identityId],
    );
    return row ? PowerSyncUserReminderPreferenceMapper.toDomain(row) : null;
  }

  async delete(identityId: string): Promise<void> {
    await this.db.execute('DELETE FROM user_reminder_preferences WHERE identity_id = ?', [
      identityId,
    ]);
  }

  async exists(identityId: string): Promise<boolean> {
    const row = await this.db.getOptional<{ identity_id: string }>(
      'SELECT identity_id FROM user_reminder_preferences WHERE identity_id = ? LIMIT 1',
      [identityId],
    );
    return !!row;
  }
}
