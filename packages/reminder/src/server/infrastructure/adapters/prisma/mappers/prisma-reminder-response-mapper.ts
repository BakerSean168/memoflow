/** Prisma ReminderResponse Mapper. */

import type { ReminderResponse as PrismaReminderResponse } from '@memoflow/database';
import {
  toReminderResponseLatencySeconds,
  toReminderSnoozeDurationSeconds,
  type ReminderResponseAction,
} from '@memoflow/contracts/reminder';
import type { IdentityId, ReminderTemplateId } from '@memoflow/contracts/primitives';
import { ReminderResponse } from '../../../../domain/entities/reminder-response';
import { ReminderResponseId } from '../../../../domain/value-objects/reminder-response-id';

export class PrismaReminderResponseMapper {
  static toDomain(data: PrismaReminderResponse): ReminderResponse {
    return ReminderResponse.load({
      id: ReminderResponseId.of(data.id),
      reminderTemplateId: data.templateId as ReminderTemplateId,
      identityId: data.identityId as IdentityId,
      action: data.action as ReminderResponseAction,
      responseTime:
        data.responseTime == null ? null : toReminderResponseLatencySeconds(data.responseTime),
      snoozeDurationSeconds:
        data.snoozeDurationSeconds == null
          ? null
          : toReminderSnoozeDurationSeconds(data.snoozeDurationSeconds),
      timestamp: data.timestamp,
    });
  }

  static toDomainList(rows: PrismaReminderResponse[]): ReminderResponse[] {
    return rows.map((row) => PrismaReminderResponseMapper.toDomain(row));
  }
}
