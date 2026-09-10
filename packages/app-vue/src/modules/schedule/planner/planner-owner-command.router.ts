import type { GoalClientPort } from '@memoflow/goal/client';
import type { ScheduleClientPort } from '@memoflow/schedule/client';
import type { TaskClientPort } from '@memoflow/task/client';
import type { Result } from '@memoflow/contracts/result';
import type { CalendarEventProjection, PlannerEventRange } from '@memoflow/contracts/schedule';
import type { RescheduleTaskInput, TaskTimeConfigDTO } from '@memoflow/contracts/task';
import type { Instant, Ymd } from '@memoflow/time';
import { getProductTime } from '../../../shared/utils/product-time';

const MINUTE_MS = 60_000;

export type PlannerMutationKind = 'move' | 'resize';

export interface PlannerMutationRequest {
  readonly kind: PlannerMutationKind;
  readonly projection: CalendarEventProjection;
  readonly nextRange: PlannerEventRange;
}

export type PlannerMutationOutcome =
  | {
      readonly status: 'applied';
      readonly ownerType: CalendarEventProjection['ownerCommandTarget']['ownerType'];
    }
  | { readonly status: 'conflict'; readonly code: string }
  | { readonly status: 'failed'; readonly code: string }
  | { readonly status: 'read-only'; readonly message: string }
  | { readonly status: 'unsupported'; readonly message: string }
  | { readonly status: 'invalid'; readonly message: string };

export interface PlannerMutationTimePort {
  readonly toYmd: (instant: Instant) => Ymd;
  readonly startOfDay: (instant: Instant) => Instant;
  readonly startOfYmd: (ymd: Ymd) => Instant;
}

export const defaultPlannerMutationTimePort: PlannerMutationTimePort = {
  toYmd: (instant) => getProductTime().calendar.toYmd(instant),
  startOfDay: (instant) => getProductTime().calendar.startOfDay(instant),
  startOfYmd: (ymd) => getProductTime().codec.startOfYmd(ymd),
};

export interface RoutinePlannerOwnerCommandPort {
  rescheduleOccurrence(input: {
    readonly routineId: string;
    readonly occurrenceId: string;
    readonly expectedVersion: number;
    readonly nextRange: PlannerEventRange;
  }): Promise<Result<unknown>>;
}

export interface PlannerOwnerCommandDependencies {
  readonly schedule?: Pick<ScheduleClientPort, 'updateSchedule'>;
  readonly task?: Pick<TaskClientPort, 'rescheduleInstance'>;
  readonly goal?: Pick<GoalClientPort, 'updateGoal'>;
  readonly routine?: RoutinePlannerOwnerCommandPort;
  readonly time?: PlannerMutationTimePort;
}

export interface PlannerOwnerCommandRouter {
  route(request: PlannerMutationRequest): Promise<PlannerMutationOutcome>;
}

function isEditable(request: PlannerMutationRequest): boolean {
  return request.kind === 'move'
    ? request.projection.editableCapabilities.move
    : request.projection.editableCapabilities.resize;
}

function resultOutcome(
  result: Result<unknown>,
  ownerType: CalendarEventProjection['ownerCommandTarget']['ownerType'],
): PlannerMutationOutcome {
  if (result.ok) return { status: 'applied', ownerType };
  const code = String(result.error.code ?? 'UNKNOWN_ERROR');
  if (code === 'CONFLICT' || code === 'VERSION_CONFLICT' || code === 'OPTIMISTIC_CONCURRENCY') {
    return { status: 'conflict', code };
  }
  return { status: 'failed', code };
}

function minutesFromDayStart(time: PlannerMutationTimePort, instant: Instant): number | null {
  const dayStart = time.startOfDay(instant);
  const delta = Number(instant) - Number(dayStart);
  if (delta < 0 || delta % MINUTE_MS !== 0) return null;
  const minutes = delta / MINUTE_MS;
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1439 ? minutes : null;
}

function taskRescheduleInput(
  projection: Extract<CalendarEventProjection, { sourceType: 'task' }>,
  nextRange: PlannerEventRange,
  time: PlannerMutationTimePort,
): RescheduleTaskInput | null {
  let newTime: TaskTimeConfigDTO;
  if (nextRange.allDay) {
    newTime = {
      timeType: 'AllDay',
      startDate: Number(time.startOfYmd(nextRange.start)),
      timePoint: null,
      timeRange: null,
    };
  } else {
    const dayStart = time.startOfDay(nextRange.start);
    const startMinute = minutesFromDayStart(time, nextRange.start);
    if (startMinute == null) return null;

    if (nextRange.end == null) {
      newTime = {
        timeType: 'TimePoint',
        startDate: Number(dayStart),
        timePoint: startMinute,
        timeRange: null,
      };
    } else {
      if (time.toYmd(nextRange.start) !== time.toYmd(nextRange.end)) return null;
      const endMinute = minutesFromDayStart(time, nextRange.end);
      if (endMinute == null || endMinute <= startMinute) return null;
      newTime = {
        timeType: 'TimeRange',
        startDate: Number(dayStart),
        timePoint: null,
        timeRange: { start: startMinute, end: endMinute },
      };
    }
  }
  return { newTime, expectedVersion: projection.revision };
}

export function createPlannerOwnerCommandRouter(
  dependencies: PlannerOwnerCommandDependencies,
): PlannerOwnerCommandRouter {
  const time = dependencies.time ?? defaultPlannerMutationTimePort;

  return {
    async route(request) {
      if (!isEditable(request)) {
        return {
          status: 'read-only',
          message: `${request.kind} is not allowed for this Planner event`,
        };
      }
      const projection = request.projection;
      const owner = projection.ownerCommandTarget;

      switch (projection.sourceType) {
        case 'schedule': {
          if (!dependencies.schedule) {
            return { status: 'unsupported', message: 'Schedule owner command is unavailable' };
          }
          if (request.nextRange.allDay || request.nextRange.end == null) {
            return { status: 'invalid', message: 'CalendarEntry requires a timed start/end range' };
          }
          return resultOutcome(
            await dependencies.schedule.updateSchedule(owner.ownerId, {
              startTime: Number(request.nextRange.start),
              endTime: Number(request.nextRange.end),
              expectedVersion: projection.revision,
            }),
            owner.ownerType,
          );
        }

        case 'task': {
          if (!dependencies.task) {
            return { status: 'unsupported', message: 'Task owner command is unavailable' };
          }
          const input = taskRescheduleInput(projection, request.nextRange, time);
          if (!input) {
            return {
              status: 'invalid',
              message: 'Task Planner range cannot be represented by TaskTimeConfig',
            };
          }
          return resultOutcome(
            await dependencies.task.rescheduleInstance(owner.ownerId, input),
            owner.ownerType,
          );
        }

        case 'goal': {
          if (!dependencies.goal) {
            return { status: 'unsupported', message: 'Goal owner command is unavailable' };
          }
          if (request.kind !== 'move') {
            return { status: 'read-only', message: 'Goal dates cannot be resized' };
          }
          const nextDay = request.nextRange.allDay
            ? request.nextRange.start
            : time.toYmd(request.nextRange.start);
          const dayStart = Number(time.startOfYmd(nextDay));
          const semantic = projection.displayMetadata.semantic;
          if (semantic !== 'goal-start' && semantic !== 'goal-deadline') {
            return {
              status: 'invalid',
              message: `Unsupported Goal Planner semantic '${semantic}'`,
            };
          }
          const requestBody =
            semantic === 'goal-start'
              ? { startDate: dayStart, expectedVersion: projection.revision }
              : { dueDate: dayStart, expectedVersion: projection.revision };
          return resultOutcome(
            await dependencies.goal.updateGoal(owner.ownerId, requestBody),
            owner.ownerType,
          );
        }

        case 'routine': {
          if (!dependencies.routine) {
            return { status: 'unsupported', message: 'Routine owner command is unavailable' };
          }
          return resultOutcome(
            await dependencies.routine.rescheduleOccurrence({
              routineId: owner.ownerId,
              occurrenceId: projection.sourceId,
              expectedVersion: projection.revision,
              nextRange: request.nextRange,
            }),
            owner.ownerType,
          );
        }
      }
    },
  };
}
