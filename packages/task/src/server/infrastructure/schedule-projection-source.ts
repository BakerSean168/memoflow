import type {
  ReminderTimeUnit,
  TaskEventMap,
  TaskReminderType,
  TaskPlanServerDTO,
} from '@memoflow/contracts/task';
import { TaskOccurrenceStatus, TaskTimeType } from '@memoflow/contracts/task';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPriority,
} from '@memoflow/contracts/schedule';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '../domain';
import {
  asHm,
  combineYmdHmWithTimeZone,
  createTimeFacade,
  type TimeContext,
  type UserTimeContextPort,
} from '@memoflow/time';

const DEFAULT_ALL_DAY_REMINDER_MINUTES = 9 * 60;
export const TASK_REMINDER_HANDLER_KEY = 'task.reminder.fire';
export const TASK_REMINDER_PAYLOAD_VERSION = 1;
export const TASK_SCHEDULING_OWNER_TYPE = 'task.template';

export interface TaskReminderScheduledPayload {
  readonly templateId: string;
  readonly instanceId: string;
  readonly occurrenceKey: string | null;
  readonly taskTitle: string;
  readonly reminderType: TaskReminderType;
  readonly reminderValue: number | null;
  readonly reminderUnit: ReminderTimeUnit | null;
  readonly reminderAbsoluteTime: number | null;
  readonly anchorTime: number;
  readonly reminderTime: number;
}

export interface TaskScheduleProjectionPlan {
  readonly owner: SchedulingOwner;
  readonly desired: readonly ScheduledIntent<TaskReminderScheduledPayload>[];
}

export interface TaskScheduleProjectionSource {
  buildTemplatePlan(templateId: string, identityId: string): Promise<TaskScheduleProjectionPlan>;
  buildTemplateOwner(templateId: string, identityId: string): SchedulingOwner;
  /** Full source scan used by startup reconcile / lost-event repair. */
  listTemplateRefs(): Promise<Array<{ templateId: string; identityId: string }>>;
}

export interface TaskScheduleProjectionHandlers {
  upsertTemplate(templateId: string, identityId: string): Promise<void>;
  deleteTemplate(templateId: string, identityId: string): Promise<void>;
}

export type TaskScheduleProjectionEventMap = Pick<
  TaskEventMap,
  | 'task:created'
  | 'task:updated'
  | 'task:instance-generated'
  | 'task:template-schedule-time-changed'
  | 'task:template-recurrence-changed'
  | 'task:template-resumed'
  | 'task:deleted'
  | 'task:template-paused'
  | 'task:instance-completed'
  | 'task:instance-skipped'
  | 'task:instance-deleted'
  | 'task:instance-uncompleted'
  | 'task:rescheduled'
>;

export const taskScheduleProjectionEventNames = [
  'task:created',
  'task:updated',
  'task:instance-generated',
  'task:template-schedule-time-changed',
  'task:template-recurrence-changed',
  'task:template-resumed',
  'task:deleted',
  'task:template-paused',
  'task:instance-completed',
  'task:instance-skipped',
  'task:instance-deleted',
  'task:instance-uncompleted',
  'task:rescheduled',
] as const satisfies readonly (keyof TaskScheduleProjectionEventMap)[];

function formatUnit(unit: ReminderTimeUnit): string {
  switch (unit) {
    case 'Minutes':
      return '分钟';
    case 'Hours':
      return '小时';
    case 'Days':
      return '天';
    default:
      return '';
  }
}

function convertDurationUnitToMs(value: number, unit: ReminderTimeUnit): number {
  switch (unit) {
    case 'Minutes':
      return value * 60 * 1000;
    case 'Hours':
      return value * 60 * 60 * 1000;
    case 'Days':
      throw new Error('Days are calendar-relative and must not be converted to 24h duration');
    default:
      return 0;
  }
}

function minuteOfDayToHm(minute: number) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return asHm(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
}

function getInstanceAnchorTime(
  instance: {
    instanceDate: number;
    timeConfig: {
      timeType: string;
      timePoint: number | null;
      timeRange?: { start: number; end: number } | null;
    };
  },
  timeContext: TimeContext,
): number {
  const time = createTimeFacade({ context: timeContext });
  const day = time.calendar.toYmd(instance.instanceDate);
  const minute =
    instance.timeConfig.timeType === TaskTimeType.TimePoint
      ? (instance.timeConfig.timePoint ?? DEFAULT_ALL_DAY_REMINDER_MINUTES)
      : instance.timeConfig.timeType === TaskTimeType.TimeRange
        ? (instance.timeConfig.timeRange?.start ?? DEFAULT_ALL_DAY_REMINDER_MINUTES)
        : DEFAULT_ALL_DAY_REMINDER_MINUTES;
  const anchor = combineYmdHmWithTimeZone(
    day,
    minuteOfDayToHm(minute),
    timeContext.timeZone,
  );
  if (anchor == null) {
    throw new Error(`Could not resolve Task reminder anchor ${day} ${minuteOfDayToHm(minute)}`);
  }
  return Number(anchor);
}

function calculateReminderAt(
  instance: {
    instanceDate: number;
    timeConfig: {
      timeType: string;
      timePoint: number | null;
      timeRange?: { start: number; end: number } | null;
    };
  },
  trigger: {
    type: TaskReminderType;
    absoluteTime: number | null;
    relativeValue: number | null;
    relativeUnit: ReminderTimeUnit | null;
  },
  timeContext: TimeContext,
): number | null {
  if (trigger.type === 'Absolute') {
    return trigger.absoluteTime;
  }

  if (trigger.relativeValue === null || trigger.relativeUnit === null) {
    return null;
  }

  const anchorTime = getInstanceAnchorTime(instance, timeContext);
  if (trigger.relativeUnit === 'Days') {
    return Number(
      createTimeFacade({ context: timeContext }).calendar.addDays(
        anchorTime,
        -trigger.relativeValue,
      ),
    );
  }

  return anchorTime - convertDurationUnitToMs(trigger.relativeValue, trigger.relativeUnit);
}

function buildIntentName(
  template: TaskPlanServerDTO,
  trigger: {
    type: TaskReminderType;
    absoluteTime: number | null;
    relativeValue: number | null;
    relativeUnit: ReminderTimeUnit | null;
  },
): string {
  if (
    trigger.type === 'Relative' &&
    trigger.relativeValue !== null &&
    trigger.relativeUnit !== null
  ) {
    return `${template.name} · 提前 ${trigger.relativeValue}${formatUnit(trigger.relativeUnit)} 提醒`;
  }
  return `${template.name} · 定时提醒`;
}

function shouldScheduleTemplate(template: TaskPlanServerDTO): boolean {
  return (
    template.status === 'Active' &&
    template.deletedAt === null &&
    !!template.reminderConfig?.enabled &&
    template.reminderConfig.triggers.length > 0
  );
}

function isSchedulableInstance(instance: { status: string; deletedAt: number | null }): boolean {
  return (
    instance.deletedAt === null &&
    (instance.status === TaskOccurrenceStatus.Pending ||
      instance.status === TaskOccurrenceStatus.InProgress)
  );
}

function taskOwner(templateId: string, identityId: string): SchedulingOwner {
  return { identityId, type: TASK_SCHEDULING_OWNER_TYPE, id: templateId };
}

function reminderIdentity(trigger: {
  type: TaskReminderType;
  absoluteTime: number | null;
  relativeValue: number | null;
  relativeUnit: ReminderTimeUnit | null;
}): string {
  if (trigger.type === 'Absolute') {
    return `absolute:${String(trigger.absoluteTime)}`;
  }
  return `relative:${String(trigger.relativeValue)}:${String(trigger.relativeUnit)}`;
}

function neutralPriority(importance: string): SchedulingPriority {
  if (importance === 'Vital') return 'urgent';
  if (importance === 'Important') return 'high';
  return 'normal';
}

export function createTaskScheduleProjectionSource(deps: {
  taskPlanRepository: ITaskPlanRepository;
  taskOccurrenceRepository: ITaskOccurrenceRepository;
  userTimeContextPort: UserTimeContextPort;
}): TaskScheduleProjectionSource {
  return {
    buildTemplateOwner(templateId, identityId) {
      return taskOwner(templateId, identityId);
    },

    async listTemplateRefs() {
      const refs = await deps.taskPlanRepository.findAllTemplateRefs();
      return refs.map((ref) => ({ templateId: ref.id, identityId: ref.identityId }));
    },

    async buildTemplatePlan(templateId, identityId) {
      const owner = taskOwner(templateId, identityId);
      const template = await deps.taskPlanRepository.findByIdForIdentity(
        identityId,
        templateId,
      );
      if (!template) {
        return { owner, desired: [] };
      }

      const timeContext = await deps.userTimeContextPort.getUserTimeContext(identityId);
      const templateDTO = template.toServerDTO();
      const canonicalOwner = taskOwner(templateId, String(templateDTO.identityId));
      if (!shouldScheduleTemplate(templateDTO) || !templateDTO.reminderConfig) {
        return { owner: canonicalOwner, desired: [] };
      }

      const instances = await deps.taskOccurrenceRepository.findByTemplateId(
        templateId,
        String(templateDTO.identityId),
      );
      const now = Date.now();
      const desiredByKey = new Map<string, ScheduledIntent<TaskReminderScheduledPayload>>();

      for (const instance of instances.filter(isSchedulableInstance)) {
        const occurrenceIdentity = instance.occurrenceKey ?? instance.id;
        const anchorTime = getInstanceAnchorTime(instance, timeContext);

        for (const trigger of templateDTO.reminderConfig.triggers) {
          const reminderAt = calculateReminderAt(instance, trigger, timeContext);
          if (reminderAt === null || reminderAt <= now) continue;

          const schedulingKey = buildSchedulingKey(
            'task.reminder',
            occurrenceIdentity,
            reminderIdentity(trigger),
          );

          // Identical reminder semantics for the same occurrence are one logical
          // invocation even if a malformed/legacy config contains duplicates.
          if (desiredByKey.has(schedulingKey)) continue;

          desiredByKey.set(schedulingKey, {
            schedulingKey,
            handlerKey: TASK_REMINDER_HANDLER_KEY,
            runAt: reminderAt,
            payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
            payload: {
              templateId: templateDTO.id,
              instanceId: instance.id,
              occurrenceKey: instance.occurrenceKey,
              taskTitle: templateDTO.name,
              reminderType: trigger.type,
              reminderValue: trigger.relativeValue,
              reminderUnit: trigger.relativeUnit,
              reminderAbsoluteTime: trigger.absoluteTime,
              anchorTime,
              reminderTime: reminderAt,
            },
            sourceRevision: `${templateDTO.version}:${instance.version}`,
            priority: neutralPriority(templateDTO.importance),
            timeoutMs: null,
            observability: {
              name: buildIntentName(templateDTO, trigger),
              tags: ['task', 'task-reminder', `template:${templateDTO.id}`],
            },
          });
        }
      }

      return { owner: canonicalOwner, desired: [...desiredByKey.values()] };
    },
  };
}

export function createTaskScheduleProjectionEventHandlers(
  handlers: TaskScheduleProjectionHandlers,
): {
  [K in keyof TaskScheduleProjectionEventMap]: (
    event: TaskScheduleProjectionEventMap[K],
  ) => Promise<void>;
} {
  return {
    'task:created': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    'task:updated': async (event) =>
      handlers.upsertTemplate(event.task.id, String(event.identityId)),
    'task:instance-generated': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    'task:template-schedule-time-changed': async (event) =>
      handlers.upsertTemplate(event.taskPlan.id, String(event.identityId)),
    'task:template-recurrence-changed': async (event) =>
      handlers.upsertTemplate(event.taskPlan.id, String(event.identityId)),
    'task:template-resumed': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
    'task:deleted': async (event) =>
      handlers.deleteTemplate(event.taskPlanId, String(event.identityId)),
    'task:template-paused': async (event) =>
      handlers.deleteTemplate(event.taskPlanId, String(event.identityId)),
    'task:instance-completed': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
    'task:instance-skipped': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
    'task:instance-deleted': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
    'task:instance-uncompleted': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
    'task:rescheduled': async (event) =>
      handlers.upsertTemplate(event.taskPlanId, String(event.identityId)),
  };
}
