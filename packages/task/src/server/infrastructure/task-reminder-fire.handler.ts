/**
 * Task reminder fire: durable NotificationRequested handler.
 *
 * Registered (composition-only) against the neutral `ScheduledHandlerRegistry`
 * under handler key `task.reminder.fire` (TASK-3102). Execution re-reads the
 * Task occurrence at fire time, validates it is still schedulable, and emits a
 * durable `NotificationRequested` envelope through the shared outbox so the
 * Notification runtime can materialize the Fact + delivery plan independently
 * of this handler's commit.
 */
import { z } from 'zod';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationRequestedSchema,
  NotificationType,
  type NotificationRequestedWriterPort,
} from '@memoflow/contracts/notification';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type {
  ScheduledHandlerRegistration,
  ScheduledInvocationContext,
  ScheduledHandlerResult,
} from '@memoflow/contracts/schedule';
import {
  ReminderTimeUnit,
  TaskOccurrenceStatus,
  TaskReminderType,
  TaskPlanStatus,
  type TaskPlanServerDTO,
} from '@memoflow/contracts/task';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import {
  TASK_REMINDER_HANDLER_KEY,
  TASK_REMINDER_PAYLOAD_VERSION,
  type TaskReminderScheduledPayload,
} from './schedule-projection-source';

/** Neutral business source for task reminder NotificationRequested envelopes. */
export const TASK_REMINDER_BUSINESS_SOURCE = 'task';

/** Workflow/topic key shared by every task reminder notification Fact. */
export const TASK_REMINDER_WORKFLOW_KEY = 'task.reminder';

export type TaskReminderSkipReason =
  | 'TASK_INSTANCE_NOT_FOUND'
  | 'TASK_INSTANCE_UNAVAILABLE'
  | 'TASK_TEMPLATE_UNAVAILABLE'
  | 'TASK_REMINDER_CONFIG_STALE'
  | 'TASK_OCCURRENCE_STALE';

export const TaskReminderScheduledPayloadSchema = z.object({
  templateId: z.string().min(1),
  instanceId: z.string().min(1),
  occurrenceKey: z.string().min(1).nullable(),
  taskTitle: z.string().min(1),
  reminderType: z.nativeEnum(TaskReminderType),
  reminderValue: z.number().nullable(),
  reminderUnit: z.nativeEnum(ReminderTimeUnit).nullable(),
  reminderAbsoluteTime: z.number().nullable(),
  anchorTime: z.number(),
  reminderTime: z.number(),
});

export type ParsedTaskReminderScheduledPayload = z.infer<typeof TaskReminderScheduledPayloadSchema>;

/**
 * Deterministic outbox operation id for one schedulingKey. Deriving the id
 * from the canonical business identity keeps crash-replay idempotent even when
 * the writer's idempotencyKey guard races with re-execution.
 */
export function buildTaskReminderOperationId(schedulingKey: string): string {
  return `task-reminder:${schedulingKey}`;
}

export interface CreateTaskReminderScheduledHandlerRegistrationDeps {
  readonly taskOccurrenceRepository: Pick<ITaskOccurrenceRepository, 'findByIdForIdentity'>;
  readonly taskPlanRepository: Pick<ITaskPlanRepository, 'findByIdForIdentity'>;
  readonly notificationRequestedWriter: NotificationRequestedWriterPort;
}

function taskReminderContent(
  taskTitle: string,
  payload: Pick<TaskReminderScheduledPayload, 'reminderType' | 'reminderValue' | 'reminderUnit'>,
): string {
  if (payload.reminderType === 'Relative' && payload.reminderValue !== null && payload.reminderUnit) {
    return `任务「${taskTitle}」的提前 ${payload.reminderValue}${payload.reminderUnit} 提醒已到达。`;
  }
  return `任务「${taskTitle}」已到达提醒时间。`;
}

function skipped(reason: TaskReminderSkipReason, message: string, result: Record<string, unknown>): ScheduledHandlerResult {
  return { status: 'skipped', reason, result };
}

/** Which trigger a scheduled payload was projected from (must match the template). */
function reminderTriggerIdentity(input: {
  type: TaskReminderType;
  absoluteTime: number | null;
  relativeValue: number | null;
  relativeUnit: ReminderTimeUnit | null;
}): string {
  if (input.type === TaskReminderType.Absolute) {
    return `absolute:${String(input.absoluteTime)}`;
  }
  return `relative:${String(input.relativeValue)}:${String(input.relativeUnit)}`;
}

export function taskReminderSkippedReasonFromTemplate(
  template: TaskPlanServerDTO | null,
  templateId: string,
  payload: Pick<
    ParsedTaskReminderScheduledPayload,
    'reminderType' | 'reminderValue' | 'reminderUnit' | 'reminderAbsoluteTime'
  >,
): { keep: true } | { keep: false; reason: TaskReminderSkipReason; message: string } {
  if (!template) {
    return {
      keep: false,
      reason: 'TASK_TEMPLATE_UNAVAILABLE',
      message: `TaskPlan '${templateId}' no longer exists; reminder is not fireable.`,
    };
  }
  if (template.deletedAt !== null) {
    return {
      keep: false,
      reason: 'TASK_TEMPLATE_UNAVAILABLE',
      message: `TaskPlan '${templateId}' is deleted; reminder is not fireable.`,
    };
  }
  if (template.status !== TaskPlanStatus.Active) {
    return {
      keep: false,
      reason: 'TASK_TEMPLATE_UNAVAILABLE',
      message: `TaskPlan '${templateId}' status is '${template.status}', not 'Active'; reminder is not fireable.`,
    };
  }
  if (!template.reminderConfig?.enabled || template.reminderConfig.triggers.length === 0) {
    return {
      keep: false,
      reason: 'TASK_TEMPLATE_UNAVAILABLE',
      message: `TaskPlan '${templateId}' reminders are disabled; reminder is not fireable.`,
    };
  }
  // Re-read of Task truth: the scheduled payload was projected from a precise
  // trigger. If the reminder config changed (type/value/unit/absolute time) or
  // the trigger was removed, the old invocation is stale and must not notify.
  const scheduledIdentity = reminderTriggerIdentity({
    type: payload.reminderType,
    absoluteTime: payload.reminderAbsoluteTime,
    relativeValue: payload.reminderValue,
    relativeUnit: payload.reminderUnit,
  });
  const stillConfigured = template.reminderConfig.triggers.some(
    (trigger) => reminderTriggerIdentity(trigger) === scheduledIdentity,
  );
  if (!stillConfigured) {
    return {
      keep: false,
      reason: 'TASK_REMINDER_CONFIG_STALE',
      message:
        `TaskPlan '${templateId}' no longer configures reminder '${scheduledIdentity}'; ` +
        'the scheduled invocation is stale and is not fireable.',
    };
  }
  return { keep: true };
}

export function createTaskReminderScheduledHandlerRegistration(
  deps: CreateTaskReminderScheduledHandlerRegistrationDeps,
): ScheduledHandlerRegistration<TaskReminderScheduledPayload> {
  return {
    handlerKey: TASK_REMINDER_HANDLER_KEY,
    payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
    validatePayload(payload: unknown): TaskReminderScheduledPayload {
      return TaskReminderScheduledPayloadSchema.parse(payload);
    },
    handler: {
      async execute(context: ScheduledInvocationContext<TaskReminderScheduledPayload>): Promise<ScheduledHandlerResult> {
        const { identityId, schedulingKey, payload } = context;
        const instance = await deps.taskOccurrenceRepository.findByIdForIdentity(identityId, payload.instanceId);
        if (!instance) {
          return skipped('TASK_INSTANCE_NOT_FOUND', `TaskOccurrence '${payload.instanceId}' no longer exists; reminder is not fireable.`, {
            instanceId: payload.instanceId,
          });
        }
        if (instance.deletedAt !== null) {
          return skipped('TASK_INSTANCE_UNAVAILABLE', `TaskOccurrence '${instance.id}' is deleted; reminder is not fireable.`, {
            instanceId: instance.id,
            status: instance.status,
          });
        }
        if (instance.status !== TaskOccurrenceStatus.Pending && instance.status !== TaskOccurrenceStatus.InProgress) {
          return skipped('TASK_INSTANCE_UNAVAILABLE', `TaskOccurrence '${instance.id}' status is '${instance.status}', not pending/in-progress; reminder is not fireable.`, {
            instanceId: instance.id,
            status: instance.status,
          });
        }
        if (instance.occurrenceKey !== payload.occurrenceKey) {
          return skipped('TASK_OCCURRENCE_STALE', `TaskOccurrence '${instance.id}' moved to a newer occurrence; stale reminder is not fireable.`, {
            instanceId: instance.id,
            staleOccurrence: payload.occurrenceKey,
            currentOccurrence: instance.occurrenceKey,
          });
        }

        const templateId = String(instance.templateId);
        const template = await deps.taskPlanRepository.findByIdForIdentity(identityId, templateId);
        const templateDecision = taskReminderSkippedReasonFromTemplate(
          template?.toServerDTO() ?? null,
          templateId,
          payload,
        );
        if (!templateDecision.keep) {
          return skipped(templateDecision.reason, templateDecision.message, {
            instanceId: instance.id,
            templateId,
          });
        }

        const taskTitle = payload.taskTitle;
        const envelope = NotificationRequestedSchema.parse({
          identityId,
          source: TASK_REMINDER_BUSINESS_SOURCE,
          occurrenceKey: schedulingKey,
          idempotencyKey: buildIdempotencyKeyString({
            identityId,
            source: TASK_REMINDER_BUSINESS_SOURCE,
            occurrenceKey: schedulingKey,
          }),
          workflowKey: TASK_REMINDER_WORKFLOW_KEY,
          topic: TASK_REMINDER_WORKFLOW_KEY,
          relatedEntity: {
            type: 'Task',
            id: instance.id,
          },
          content: {
            title: `任务提醒：${taskTitle}`,
            content: taskReminderContent(taskTitle, payload),
            type: NotificationType.Reminder,
            category: NotificationCategory.Task,
          },
          suggestedChannels: [NotificationChannelType.InApp, NotificationChannelType.Push],
          correlationId: schedulingKey,
          causationId: schedulingKey,
        });

        const receipt = await deps.notificationRequestedWriter.enqueueNotificationRequested({
          operationId: buildTaskReminderOperationId(schedulingKey),
          envelope,
          correlationId: schedulingKey,
          causationId: schedulingKey,
        });

        return {
          status: 'succeeded',
          result: {
            instanceId: instance.id,
            templateId,
            schedulingKey,
            notificationOperationId: receipt.operationId,
            notificationStatus: receipt.status,
          },
        };
      },
    },
  };
}