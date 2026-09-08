import {
  TaskPlanScheduleSchema,
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
  TaskTimingKind,
  type TaskPlanSchedule,
} from '@memoflow/contracts/task';

export interface DraftTaskScheduleInput {
  readonly cadence: 'once' | 'daily' | 'weekly';
  readonly startDate: number | null | undefined;
  readonly timeOfDay?: string;
  readonly timezone?: string | null;
  readonly daysOfWeek: readonly number[];
  readonly occurrences: number | null;
}

function calendarDateAt(epochMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve Task calendar date in timezone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * Maps an approved AI planning draft onto the same canonical schedule contract
 * used by user-created Task Plans. No legacy TaskTimeConfig/RecurrenceRule lane
 * is created for AI.
 */
export function taskPlanScheduleFromDraft(input: DraftTaskScheduleInput): TaskPlanSchedule {
  if (input.startDate == null) {
    throw new Error('Task plan requires a deterministic start date before it can be applied');
  }
  const timeZone = input.timezone ?? 'UTC';
  const date = calendarDateAt(input.startDate, timeZone);
  const timing = input.timeOfDay
    ? { kind: TaskTimingKind.At, time: input.timeOfDay }
    : { kind: TaskTimingKind.AllDay };

  if (input.cadence === 'once') {
    return TaskPlanScheduleSchema.parse({
      kind: TaskPlanScheduleKind.OneTime,
      date,
      timing,
    });
  }

  return TaskPlanScheduleSchema.parse({
    kind: TaskPlanScheduleKind.Recurring,
    startDate: date,
    timing,
    recurrence: {
      frequency: input.cadence === 'daily' ? 'Daily' : 'Weekly',
      interval: 1,
      byWeekday: input.cadence === 'weekly' ? [...input.daysOfWeek] : [],
      end:
        input.occurrences == null
          ? { kind: TaskRecurrenceEndKind.Never }
          : { kind: TaskRecurrenceEndKind.Count, count: input.occurrences },
    },
  });
}
