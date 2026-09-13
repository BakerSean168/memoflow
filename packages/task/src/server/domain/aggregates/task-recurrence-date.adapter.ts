import { RecurrenceFrequency as TaskRecurrenceFrequency } from '@memoflow/contracts/task';
import {
  asHm,
  asInstant,
  createRecurrenceEngine,
  createTimeFacade,
  type RecurrenceEnginePort,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
  type RecurrenceWeekday,
  type TimeContext,
} from '@memoflow/time';
import type { TaskRecurrence } from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';

const FREQUENCY_MAP: Record<
  (typeof TaskRecurrenceFrequency)[keyof typeof TaskRecurrenceFrequency],
  RecurrenceFrequency
> = {
  [TaskRecurrenceFrequency.Daily]: 'daily',
  [TaskRecurrenceFrequency.Weekly]: 'weekly',
  [TaskRecurrenceFrequency.Monthly]: 'monthly',
  [TaskRecurrenceFrequency.Yearly]: 'yearly',
};

export interface TaskRecurrenceDateAdapter {
  between(
    recurrence: TaskRecurrence,
    startDate: Ymd,
    from: number,
    to: number,
    timeContext: TimeContext,
  ): number[];
  occursOn(
    recurrence: TaskRecurrence,
    startDate: Ymd,
    date: number,
    timeContext: TimeContext,
  ): boolean;
  next(
    recurrence: TaskRecurrence,
    startDate: Ymd,
    after: number,
    timeContext: TimeContext,
  ): number | null;
}

function toSchedule(
  recurrence: TaskRecurrence,
  startDate: Ymd,
  timeContext: TimeContext,
): RecurrenceSchedule {
  const time = createTimeFacade({ context: timeContext });

  return {
    startDate,
    // Canonical TaskTiming/Plan schedule owns the actual point/range; recurrence
    // must not absorb Task execution-time semantics.
    localTime: asHm('00:00'),
    // Task currently behaves as a floating user-local calendar schedule. The
    // current user's canonical Product Time context is supplied by the caller;
    // ambient server/device timezone is never consulted here.
    timeZone: timeContext.timeZone,
    frequency: FREQUENCY_MAP[recurrence.frequency],
    interval: recurrence.interval,
    byWeekday: recurrence.byWeekday as RecurrenceWeekday[],
    count: recurrence.end.kind === 'Count' ? recurrence.end.count : null,
    // Existing Task semantics define endDate as inclusive for that local day.
    until:
      recurrence.end.kind === 'Until'
        ? time.calendar.endOfDay(asInstant(time.codec.startOfYmd(recurrence.end.date)))
        : null,
  };
}

export function createTaskRecurrenceDateAdapter(
  recurrenceEngine: RecurrenceEnginePort = createRecurrenceEngine(),
): TaskRecurrenceDateAdapter {
  return {
    between(recurrence, startDate, from, to, timeContext) {
      return recurrenceEngine.between(toSchedule(recurrence, startDate, timeContext), {
        from: asInstant(from),
        to: asInstant(to),
        inclusive: true,
      });
    },

    occursOn(recurrence, startDate, date, timeContext) {
      const time = createTimeFacade({ context: timeContext });
      const dayStart = time.calendar.startOfDay(asInstant(date));
      const dayEnd = time.calendar.endOfDay(asInstant(date));
      return (
        recurrenceEngine.between(toSchedule(recurrence, startDate, timeContext), {
          from: dayStart,
          to: dayEnd,
          inclusive: true,
        }).length > 0
      );
    },

    next(recurrence, startDate, after, timeContext) {
      return recurrenceEngine.next(
        toSchedule(recurrence, startDate, timeContext),
        asInstant(after),
        false,
      );
    },
  };
}

const defaultAdapter = createTaskRecurrenceDateAdapter();

export function recurrenceDatesBetween(
  recurrence: TaskRecurrence,
  startDate: Ymd,
  from: number,
  to: number,
  timeContext: TimeContext,
): number[] {
  return defaultAdapter.between(recurrence, startDate, from, to, timeContext);
}

export function recurrenceOccursOn(
  recurrence: TaskRecurrence,
  startDate: Ymd,
  date: number,
  timeContext: TimeContext,
): boolean {
  return defaultAdapter.occursOn(recurrence, startDate, date, timeContext);
}

export function nextRecurrenceDate(
  recurrence: TaskRecurrence,
  startDate: Ymd,
  after: number,
  timeContext: TimeContext,
): number | null {
  return defaultAdapter.next(recurrence, startDate, after, timeContext);
}
