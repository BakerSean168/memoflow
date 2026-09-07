import type {
  ReminderStatus,
  ReminderType,
  NotificationChannel,
  TriggerResult,
} from '@memoflow/contracts/reminder';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderTemplate } from '../../../../domain/aggregates/reminder-template';
import { ReminderHistory } from '../../../../domain/entities/reminder-history';
import { ReminderTemplateId } from '../../../../domain/value-objects/reminder-template-id';
import { ReminderHistoryId } from '../../../../domain/value-objects/reminder-history-id';
import {
  TriggerConfig,
  ActiveTimeConfig,
  NotificationConfig,
  ActiveHoursConfig,
} from '../../../../domain/value-objects';

export type PowerSyncReminderTemplateRow = {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  type: string;
  self_enabled: number | boolean;
  status: string;
  importance_level: string;
  tags: string;
  color: string | null;
  icon: string | null;
  next_trigger_at: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  trigger: string;
  active_time: string;
  active_hours: string | null;
  notification_config: string;
  stats: string | null;
};

export type PowerSyncReminderHistoryRow = {
  id: string;
  identity_id: string;
  template_id: string;
  triggered_at: string;
  result: string;
  error: string | null;
  notification_sent: number | boolean;
  notification_channel: string | null;
  created_at: string;
};

export class PowerSyncReminderTemplateMapper {
  static toDomain(
    data: PowerSyncReminderTemplateRow,
    historyRows: PowerSyncReminderHistoryRow[] = [],
  ): ReminderTemplate {

    const history = historyRows.map((row) =>
      ReminderHistory.load({
        id: ReminderHistoryId.of(row.id),
        templateId: row.template_id,
        identityId: row.identity_id,
        triggeredAt: new Date(row.triggered_at).getTime(),
        result: row.result as TriggerResult,
        error: row.error ?? null,
        notificationSent: row.notification_sent === true || row.notification_sent === 1,
        notificationChannels: row.notification_channel
          ? (JSON.parse(row.notification_channel) as NotificationChannel[])
          : null,
        createdAt: new Date(row.created_at).getTime(),
      }),
    );

    return ReminderTemplate.load({
      id: ReminderTemplateId.of(data.id),
      identityId: IdentityId.of(data.identity_id),
      title: data.name,
      description: data.description ?? null,
      type: data.type as ReminderType,
      trigger: TriggerConfig.fromDTO(JSON.parse(data.trigger)),
      activeTime: ActiveTimeConfig.fromDTO(JSON.parse(data.active_time)),
      activeHours: data.active_hours
        ? ActiveHoursConfig.fromDTO(JSON.parse(data.active_hours))
        : null,
      notificationConfig: NotificationConfig.fromDTO(JSON.parse(data.notification_config)),
      selfEnabled: data.self_enabled === true || data.self_enabled === 1,
      status: data.status as ReminderStatus,
      effectiveEnabled: data.self_enabled === true || data.self_enabled === 1,
      importanceLevel: data.importance_level as ImportanceLevel,
      tags: JSON.parse(data.tags ?? '[]') as string[],
      color: data.color ?? null,
      icon: data.icon ?? null,
      nextTriggerAt: data.next_trigger_at ? new Date(data.next_trigger_at).getTime() : null,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : null,
      version: data.version ?? 1,
      history,
    });
  }

  static toPersistence(template: ReminderTemplate) {
    const dto = template.toServerDTO();
    return {
      id: String(dto.id),
      identityId: String(dto.identityId),
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type,
      selfEnabled: dto.selfEnabled ? 1 : 0,
      status: dto.status,
      importanceLevel: dto.importanceLevel,
      tags: JSON.stringify(dto.tags),
      color: dto.color ?? null,
      icon: dto.icon ?? null,
      nextTriggerAt: dto.nextTriggerAt != null ? new Date(dto.nextTriggerAt).toISOString() : null,
      version: dto.version,
      createdAt: new Date(dto.createdAt).toISOString(),
      updatedAt: new Date(dto.updatedAt).toISOString(),
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).toISOString() : null,
      trigger: JSON.stringify(dto.trigger),
      activeTime: JSON.stringify(dto.activeTime),
      activeHours: dto.activeHours ? JSON.stringify(dto.activeHours) : null,
      notificationConfig: JSON.stringify(dto.notificationConfig),
      stats: '{}',
    };
  }
}
