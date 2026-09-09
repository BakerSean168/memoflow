import { RecurrenceFrequency as TaskRecurrenceFrequency } from '@memoflow/contracts/task';
import {
  asHm,
  asInstant,
  createRecurrenceEngine,
  createTimeContext,
  createTimeFacade,
  resolveTimeZoneId,
  type RecurrenceEnginePort,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
  type RecurrenceWeekday,
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
  ): number[];
  occursOn(rule: RecurrenceRule, timeConfig: TaskTimeConfig | null, date: number): boolean;
  next(rule: RecurrenceRule, timeConfig: TaskTimeConfig | null, after: number): number | null;
}

function createTaskLocalTime() {
  const timeZone = resolveTimeZoneId('local');
  return {
    timeZone,
    time: createTimeFacade({
      context: createTimeContext({ timeZone, weekStartsOn: 1 }),
    }),
  };
}

function toSchedule(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  local = createTaskLocalTime(),
): RecurrenceSchedule {
  if (timeConfig?.startDate == null) {
    throw new Error('Recurring Task requires an anchored local date');
  }
  const startDate = local.time.calendar.toYmd(asInstant(timeConfig.startDate));

  return {
    startDate,
    // Task recurrence owns calendar dates only. TaskTimeConfig keeps the actual
    // point/range; recurrence must not absorb Task execution-time semantics.
    localTime: asHm('00:00'),
    // Task vNext is a floating-local-date product contract: use the current
    // device/system IANA zone. Unlike Routine, Task does not persist a zone.
    timeZone: local.timeZone,
    frequency: FREQUENCY_MAP[rule.frequency],
    interval: rule.interval,
    byWeekday: rule.daysOfWeek as RecurrenceWeekday[],
    count: rule.occurrences,
    // Existing Task semantics define endDate as inclusive for that local day.
    until: rule.endDate == null ? null : local.time.calendar.endOfDay(asInstant(rule.endDate)),
  };
}

export function createTaskRecurrenceDateAdapter(
  recurrenceEngine: RecurrenceEnginePort = createRecurrenceEngine(),
): TaskRecurrenceDateAdapter {
  return {
    between(rule, timeConfig, from, to) {
      const local = createTaskLocalTime();
      return recurrenceEngine.between(toSchedule(rule, timeConfig, local), {
        from: asInstant(from),
        to: asInstant(to),
        inclusive: true,
      });
    },

    occursOn(rule, timeConfig, date) {
      const local = createTaskLocalTime();
      const dayStart = local.time.calendar.startOfDay(asInstant(date));
      const dayEnd = local.time.calendar.endOfDay(asInstant(date));
      return (
        recurrenceEngine.between(toSchedule(rule, timeConfig, local), {
          from: dayStart,
          to: dayEnd,
          inclusive: true,
        }).length > 0
      );
    },

    next(rule, timeConfig, after) {
      const local = createTaskLocalTime();
      return recurrenceEngine.next(toSchedule(rule, timeConfig, local), asInstant(after), false);
    },
  };
}

const defaultAdapter = createTaskRecurrenceDateAdapter();

export function recurrenceDatesBetween(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  from: number,
  to: number,
): number[] {
  return defaultAdapter.between(rule, timeConfig, from, to);
}

export function recurrenceOccursOn(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  date: number,
): boolean {
  return defaultAdapter.occursOn(rule, timeConfig, date);
}

export function nextRecurrenceDate(
  rule: RecurrenceRule,
  timeConfig: TaskTimeConfig | null,
  after: number,
): number | null {
  return defaultAdapter.next(rule, timeConfig, after);
}
