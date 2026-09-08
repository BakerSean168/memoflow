import {
  toReminderResponseLatencySeconds,
  toReminderSnoozeDurationSeconds,
  type ReminderResponseAction,
} from '@memoflow/contracts/reminder';
import type { IdentityId, ReminderTemplateId } from '@memoflow/contracts/primitives';
import { ReminderResponse } from '../../../../domain/entities/reminder-response';
import { ReminderResponseId } from '../../../../domain/value-objects/reminder-response-id';

export type PowerSyncReminderResponseRow = {
  id: string;
  identity_id: string;
  template_id: string;
  action: string;
  response_time: number | null;
  snooze_duration_seconds: number | null;
  timestamp: string;
  created_at: string;
};

export class PowerSyncReminderResponseMapper {
  static toDomain(data: PowerSyncReminderResponseRow): ReminderResponse {
    return ReminderResponse.load({
      id: ReminderResponseId.of(data.id),
      reminderTemplateId: data.template_id as ReminderTemplateId,
      identityId: data.identity_id as IdentityId,
      action: data.action as ReminderResponseAction,
      responseTime:
        data.response_time == null ? null : toReminderResponseLatencySeconds(data.response_time),
      snoozeDurationSeconds:
        data.snooze_duration_seconds == null
          ? null
          : toReminderSnoozeDurationSeconds(data.snooze_duration_seconds),
      timestamp: new Date(data.timestamp),
    });
  }
}
