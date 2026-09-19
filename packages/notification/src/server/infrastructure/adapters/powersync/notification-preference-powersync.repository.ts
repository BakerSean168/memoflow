import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { NotificationChannelType, QuietHoursDTO } from '@memoflow/contracts/notification';
import { parseJsonSafe } from '@memoflow/utils/shared';
import { NotificationPreference } from '../../../domain/aggregates/notification-preference';
import { QuietHours } from '../../../domain/value-objects/quiet-hours';
import type { INotificationPreferenceRepository } from '../../../domain/repositories/i-notification-preference-repository';

interface NotificationPreferenceRow {
  id: string;
  identity_id: string;
  global_channels: string | null;
  workflow_overrides: string | null;
  quiet_hours: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function hydratePreference(row: NotificationPreferenceRow): NotificationPreference {
  const globalChannels = parseJsonSafe<Record<NotificationChannelType, boolean>>(
    row.global_channels,
  ) ?? {} as Record<NotificationChannelType, boolean>;
  const workflowOverrides = parseJsonSafe<
    Record<string, Partial<Record<NotificationChannelType, boolean>>>
  >(row.workflow_overrides) ?? {};
  return NotificationPreference.load({
    id: row.id as never,
    identityId: row.identity_id as never,
    globalChannels: new Map(Object.entries(globalChannels) as [NotificationChannelType, boolean][]),
    workflowOverrides: new Map(
      Object.entries(workflowOverrides).map(([workflowKey, channels]) => [
        workflowKey,
        new Map(Object.entries(channels) as [NotificationChannelType, boolean][]),
      ]),
    ),
    quietHours: (() => {
      const dto = parseJsonSafe<QuietHoursDTO>(row.quiet_hours);
      return dto ? QuietHours.fromDTO(dto) : null;
    })(),
    version: row.version ?? 1,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

export class PowerSyncNotificationPreferenceRepository implements INotificationPreferenceRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async save(preference: NotificationPreference): Promise<void> {
    const dto = preference.toServerDTO();
    await this.db.execute(
      `INSERT OR REPLACE INTO notification_preferences (
         id, identity_id, global_channels, workflow_overrides, quiet_hours,
         version, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.id,
        dto.identityId,
        JSON.stringify(dto.globalChannels),
        JSON.stringify(dto.workflowOverrides),
        dto.quietHours ? JSON.stringify(dto.quietHours) : null,
        dto.version,
        new Date(dto.createdAt).toISOString(),
        new Date(dto.updatedAt).toISOString(),
        dto.deletedAt ? new Date(dto.deletedAt).toISOString() : null,
      ],
    );
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<NotificationPreference | null> {
    const row = await this.db.getOptional<NotificationPreferenceRow>(
      `SELECT * FROM notification_preferences WHERE id = ? AND identity_id = ? LIMIT 1`,
      [id, identityId],
    );
    return row ? hydratePreference(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<NotificationPreference | null> {
    const row = await this.db.getOptional<NotificationPreferenceRow>(
      `SELECT * FROM notification_preferences WHERE identity_id = ? LIMIT 1`, [identityId],
    );
    return row ? hydratePreference(row) : null;
  }

  async delete(identityId: string, id: string): Promise<void> {
    if (!(await this.findByIdForIdentity(identityId, id))) {
      throw new Error('Notification preference not found for the current identity.');
    }
    await this.db.execute(`DELETE FROM notification_preferences WHERE id = ? AND identity_id = ?`, [id, identityId]);
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    return (await this.findByIdForIdentity(identityId, id)) !== null;
  }

  async existsForIdentity(identityId: string): Promise<boolean> {
    return (await this.findByIdentityId(identityId)) !== null;
  }

  async getOrCreate(identityId: string): Promise<NotificationPreference> {
    const existing = await this.findByIdentityId(identityId);
    if (existing) return existing;
    const preference = NotificationPreference.create({ identityId: identityId as never });
    await this.save(preference);
    return preference;
  }
}
