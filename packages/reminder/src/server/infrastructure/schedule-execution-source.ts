import {
  NotificationCategory,
  NotificationChannelType,
  NotificationRequestedSchema,
  NotificationType,
  RelatedEntityType,
  type NotificationRequestedOutboxInput,
} from '@memoflow/contracts/notification';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type { IReminderTemplateRepository } from '../domain/repositories/i-reminder-template-repository';
import type { ReminderScheduleExecutionSource } from '../../schedule-execution';
import type { ReminderScheduleExecutionCommitPort } from './schedule-execution-commit.port';

export const LEGACY_REMINDER_NOTIFICATION_SOURCE = 'reminder' as const;
export const LEGACY_REMINDER_WORKFLOW_KEY = 'reminder.trigger' as const;

export interface CreateReminderScheduleExecutionSourceDeps {
  readonly reminderTemplateRepository: Pick<IReminderTemplateRepository, 'findByIdForIdentity'>;
  readonly commitPort: ReminderScheduleExecutionCommitPort;
}

function mapReminderChannels(channels: unknown): NotificationChannelType[] {
  if (!Array.isArray(channels) || channels.length === 0) {
    return [NotificationChannelType.InApp];
  }
  const allowed = new Set<string>(Object.values(NotificationChannelType));
  const mapped = channels
    .filter((channel): channel is string => typeof channel === 'string' && allowed.has(channel))
    .map((channel) => channel as NotificationChannelType);
  return mapped.length > 0 ? mapped : [NotificationChannelType.InApp];
}

function buildOccurrenceKey(reminderId: string, scheduledFor: number): string {
  return `${reminderId}:${new Date(scheduledFor).toISOString()}`;
}

function buildOperationId(reminderId: string, scheduledFor: number): string {
  return `reminder-trigger:${reminderId}:${scheduledFor}`;
}

export function createReminderScheduleExecutionSource(
  deps: CreateReminderScheduleExecutionSourceDeps,
): ReminderScheduleExecutionSource {
  return {
    async executeReminder(task) {
      const reminder = await deps.reminderTemplateRepository.findByIdForIdentity(
        String(task.identityId),
        task.sourceEntityId,
        { includeHistory: true },
      );

      if (!reminder || !reminder.isEffectivelyEnabled() || reminder.deletedAt) {
        return { nextRunAt: null, result: { skipped: true } };
      }

      const scheduledFor = task.nextRunAt?.getTime() ?? reminder.nextTriggerAt;
      if (scheduledFor == null) {
        return { nextRunAt: null, result: { skipped: true, reason: 'NO_DUE_TIME' } };
      }

      // Crash/replay guard: if the Reminder aggregate has already advanced past
      // the scheduled invocation, the atomic business commit already won.
      // Do not append another history row or another notification request.
      if (reminder.nextTriggerAt !== scheduledFor) {
        return {
          nextRunAt: reminder.nextTriggerAt,
          result: {
            skipped: true,
            reason: 'STALE_SCHEDULE_OCCURRENCE',
            reminderId: reminder.id,
          },
        };
      }

      const identityId = String(reminder.identityId);
      const occurrenceKey = buildOccurrenceKey(reminder.id, scheduledFor);
      const idempotencyKey = buildIdempotencyKeyString({
        identityId,
        source: LEGACY_REMINDER_NOTIFICATION_SOURCE,
        occurrenceKey,
      });
      const notificationRequested: NotificationRequestedOutboxInput = {
        operationId: buildOperationId(reminder.id, scheduledFor),
        envelope: NotificationRequestedSchema.parse({
          identityId,
          source: LEGACY_REMINDER_NOTIFICATION_SOURCE,
          occurrenceKey,
          idempotencyKey,
          workflowKey: LEGACY_REMINDER_WORKFLOW_KEY,
          topic: LEGACY_REMINDER_WORKFLOW_KEY,
          relatedEntity: { type: RelatedEntityType.Reminder, id: reminder.id },
          content: {
            title: reminder.notificationConfig.title?.trim() || reminder.title,
            content:
              reminder.notificationConfig.body?.trim() ||
              reminder.description?.trim() ||
              `提醒「${reminder.title}」已到达。`,
            type: NotificationType.Reminder,
            category: NotificationCategory.Reminder,
          },
          suggestedChannels: mapReminderChannels(reminder.notificationConfig.channels),
          correlationId: occurrenceKey,
          causationId: occurrenceKey,
        }),
        correlationId: occurrenceKey,
        causationId: occurrenceKey,
      };

      reminder.recordTrigger();
      const committed = await deps.commitPort.commit({
        template: reminder,
        expectedNextTriggerAt: scheduledFor,
        notificationRequested,
      });

      if (!committed.applied) {
        return {
          nextRunAt: committed.nextRunAt,
          result: {
            skipped: true,
            reason: 'STALE_SCHEDULE_OCCURRENCE',
            reminderId: reminder.id,
          },
        };
      }

      return {
        nextRunAt: committed.nextRunAt,
        result: {
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          notificationOperationId: committed.notificationOperationId,
        },
      };
    },
  };
}
