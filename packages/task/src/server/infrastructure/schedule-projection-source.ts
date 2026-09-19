import type {
  ReminderTimeUnit,
  TaskEventMap,
  TaskReminderType,
  TaskPlanServerDTO,
} from '@memoflow/contracts/task';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingPriority,
} from '@memoflow/contracts/schedule';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '../domain';
import type { TaskOccurrence } from '../domain/aggregates/task-occurrence';
import {
  asHm,
  combineYmdHmWithTimeZone,
  createTimeFacade,
  type TimeContext,
  type UserTimeContextPort,
} from '@memoflow/time';

const DEFAULT_ALL_DAY_REMINDER_MINUTES = 9 * 60;
export const TASK_REMINDER_HANDLER_KEY = 'task.reminder.fire';
export const TASK_REMINDER_PAYLOAD_VERSION = 2;
export const TASK_SCHEDULING_OWNER_TYPE = 'task.plan';

export interface TaskReminderScheduledPayload {
  readonly planId: string;
  readonly occurrenceId: string;
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
  buildPlanProjection(planId: string, identityId: string): Promise<TaskScheduleProjectionPlan>;
  buildPlanOwner(planId: string, identityId: string): SchedulingOwner;
  /** Full source scan used by startup reconcile / lost-event repair. */
  listPlanRefs(): Promise<Array<{ planId: string; identityId: string }>>;
}

export interface TaskScheduleProjectionHandlers {
  upsertPlan(planId: string, identityId: string): Promise<void>;
  deletePlan(planId: string, identityId: string): Promise<void>;
}

export type TaskScheduleProjectionEventMap = Pick<
  TaskEventMap,
  | 'task:created'
  | 'task:updated'
  | 'task:occurrence-generated'
  | 'task:plan-resumed'
  | 'task:deleted'
  | 'task:plan-paused'
  | 'task:occurrence-completed'
  | 'task:occurrence-skipped'
  | 'task:occurrence-deleted'
  | 'task:occurrence-uncompleted'
  | 'task:rescheduled'
>;

export const taskScheduleProjectionEventNames = [
  'task:created',
  'task:updated',
  'task:occurrence-generated',
  'task:plan-resumed',
  'task:deleted',
  'task:plan-paused',
  'task:occurrence-completed',
  'task:occurrence-skipped',
  'task:occurrence-deleted',
  'task:occurrence-uncompleted',
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

function getOccurrenceAnchorTime(occurrence: TaskOccurrence, timeContext: TimeContext): number {
  const day = occurrence.scheduleDate;
  const timing = occurrence.scheduleSnapshot.timing;
  const minute =
    timing.kind === 'At'
      ? Number(timing.time.slice(0, 2)) * 60 + Number(timing.time.slice(3, 5))
      : timing.kind === 'Window'
        ? Number(timing.start.slice(0, 2)) * 60 + Number(timing.start.slice(3, 5))
        : DEFAULT_ALL_DAY_REMINDER_MINUTES;
  const anchor = combineYmdHmWithTimeZone(day, minuteOfDayToHm(minute), timeContext.timeZone);
  if (anchor == null) {
    throw new Error(`Could not resolve Task reminder anchor ${day} ${minuteOfDayToHm(minute)}`);
  }
  return Number(anchor);
}

function calculateReminderAt(
  occurrence: TaskOccurrence,
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

  const anchorTime = getOccurrenceAnchorTime(occurrence, timeContext);
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
  plan: TaskPlanServerDTO,
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
    return `${plan.name} · 提前 ${trigger.relativeValue}${formatUnit(trigger.relativeUnit)} 提醒`;
  }
  return `${plan.name} · 定时提醒`;
}

function shouldSchedulePlan(plan: TaskPlanServerDTO): boolean {
  return (
    plan.status === 'Active' &&
    plan.deletedAt === null &&
    !!plan.reminderConfig?.enabled &&
    plan.reminderConfig.triggers.length > 0
  );
}

function isSchedulableOccurrence(occurrence: { status: string; deletedAt: number | null }): boolean {
  return (
    occurrence.deletedAt === null &&
    (occurrence.status === TaskOccurrenceStatus.Pending ||
      occurrence.status === TaskOccurrenceStatus.InProgress)
  );
}

function taskOwner(planId: string, identityId: string): SchedulingOwner {
  return { identityId, type: TASK_SCHEDULING_OWNER_TYPE, id: planId };
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
    buildPlanOwner(planId, identityId) {
      return taskOwner(planId, identityId);
    },

    async listPlanRefs() {
      const refs = await deps.taskPlanRepository.findAllPlanRefs();
      return refs.map((ref) => ({ planId: ref.id, identityId: ref.identityId }));
    },

    async buildPlanProjection(planId, identityId) {
      const owner = taskOwner(planId, identityId);
      const plan = await deps.taskPlanRepository.findByIdForIdentity(identityId, planId);
      if (!plan) {
        return { owner, desired: [] };
      }

      const timeContext = await deps.userTimeContextPort.getUserTimeContext(identityId);
      const planDTO = plan.toServerDTO();
      const canonicalOwner = taskOwner(planId, String(planDTO.identityId));
      if (!shouldSchedulePlan(planDTO) || !planDTO.reminderConfig) {
        return { owner: canonicalOwner, desired: [] };
      }

      const occurrences = await deps.taskOccurrenceRepository.findByPlanId(
        planId,
        String(planDTO.identityId),
      );
      const now = Date.now();
      const desiredByKey = new Map<string, ScheduledIntent<TaskReminderScheduledPayload>>();

      for (const occurrence of occurrences.filter(isSchedulableOccurrence)) {
        const occurrenceIdentity = occurrence.occurrenceKey ?? occurrence.id;
        const anchorTime = getOccurrenceAnchorTime(occurrence, timeContext);

        for (const trigger of planDTO.reminderConfig.triggers) {
          const reminderAt = calculateReminderAt(occurrence, trigger, timeContext);
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
              planId: planDTO.id,
              occurrenceId: occurrence.id,
              occurrenceKey: occurrence.occurrenceKey,
              taskTitle: planDTO.name,
              reminderType: trigger.type,
              reminderValue: trigger.relativeValue,
              reminderUnit: trigger.relativeUnit,
              reminderAbsoluteTime: trigger.absoluteTime,
              anchorTime,
              reminderTime: reminderAt,
            },
            sourceRevision: `${planDTO.version}:${occurrence.version}`,
            priority: neutralPriority(planDTO.importance),
            timeoutMs: null,
            observability: {
              name: buildIntentName(planDTO, trigger),
              tags: ['task', 'task-reminder', `plan:${planDTO.id}`],
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
      handlers.upsertPlan(event.planId, String(event.identityId)),
    'task:updated': async (event) =>
      handlers.upsertPlan(event.task.id, String(event.identityId)),
    'task:occurrence-generated': async (event) =>
      handlers.upsertPlan(event.planId, String(event.identityId)),
    'task:plan-resumed': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
    'task:deleted': async (event) =>
      handlers.deletePlan(event.taskPlanId, String(event.identityId)),
    'task:plan-paused': async (event) =>
      handlers.deletePlan(event.taskPlanId, String(event.identityId)),
    'task:occurrence-completed': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
    'task:occurrence-skipped': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
    'task:occurrence-deleted': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
    'task:occurrence-uncompleted': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
    'task:rescheduled': async (event) =>
      handlers.upsertPlan(event.taskPlanId, String(event.identityId)),
  };
}
