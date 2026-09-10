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
import type { RecurrenceRule, TaskTimeConfig } from '../value-objects';

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
    rule: RecurrenceRule,
    timeConfig: TaskTimeConfig | null,
    from: number,
    to: number,
    timeContext: TimeContext,
  ): number[];
  occursOn(
    rule: RecurrenceRule,
    timeConfig: TaskTimeConfig | null,
    date: number,
    timeContext: TimeContext,
  ): boolean;
  next(
    rule: RecurrenceRule,
    timeConfig: TaskTimeConfig | null,
    after: number,
    timeContext: TimeContext,
  ): number | null;
}

function toSchedule(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  timeContext: TimeContext,
): RecurrenceSchedule {
  if (timeConfig?.startDate == null) {
    throw new Error('Recurring Task requires an anchored local date');
  }

  const time = createTimeFacade({ context: timeContext });
  const startDate = time.calendar.toYmd(asInstant(timeConfig.startDate));

  return {
    startDate,
    // Task recurrence owns calendar dates only. TaskTimeConfig keeps the actual
    // point/range; recurrence must not absorb Task execution-time semantics.
    localTime: asHm('00:00'),
    // Task currently behaves as a floating user-local calendar schedule. The
    // current user's canonical Product Time context is supplied by the caller;
    // ambient server/device timezone is never consulted here.
    timeZone: timeContext.timeZone,
    frequency: FREQUENCY_MAP[rule.frequency],
    interval: rule.interval,
    byWeekday: rule.daysOfWeek as RecurrenceWeekday[],
    count: rule.occurrences,
    // Existing Task semantics define endDate as inclusive for that local day.
    until: rule.endDate == null ? null : time.calendar.endOfDay(asInstant(rule.endDate)),
  };
}

export function createTaskRecurrenceDateAdapter(
  recurrenceEngine: RecurrenceEnginePort = createRecurrenceEngine(),
): TaskRecurrenceDateAdapter {
  return {
    between(rule, timeConfig, from, to, timeContext) {
      return recurrenceEngine.between(toSchedule(rule, timeConfig, timeContext), {
        from: asInstant(from),
        to: asInstant(to),
        inclusive: true,
      });
    },

    occursOn(rule, timeConfig, date, timeContext) {
      const time = createTimeFacade({ context: timeContext });
      const dayStart = time.calendar.startOfDay(asInstant(date));
      const dayEnd = time.calendar.endOfDay(asInstant(date));
      return (
        recurrenceEngine.between(toSchedule(rule, timeConfig, timeContext), {
          from: dayStart,
          to: dayEnd,
          inclusive: true,
        }).length > 0
      );
    },

    next(rule, timeConfig, after, timeContext) {
      return recurrenceEngine.next(
        toSchedule(rule, timeConfig, timeContext),
        asInstant(after),
        false,
      );
    },
  };
}

const defaultAdapter = createTaskRecurrenceDateAdapter();

export function recurrenceDatesBetween(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  from: number,
  to: number,
  timeContext: TimeContext,
): number[] {
  return defaultAdapter.between(rule, timeConfig, from, to, timeContext);
}

export function recurrenceOccursOn(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  date: number,
  timeContext: TimeContext,
): boolean {
  return defaultAdapter.occursOn(rule, timeConfig, date, timeContext);
}

export function nextRecurrenceDate(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  after: number,
  timeContext: TimeContext,
): number | null {
  return defaultAdapter.next(rule, timeConfig, after, timeContext);
}
