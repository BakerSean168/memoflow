import { ValueObject } from '@memoflow/utils/domain';
import type {
  TaskPlanSchedule as TaskPlanScheduleDTO,
  TaskTiming,
  TaskRecurrence,
} from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  TaskPlanScheduleKind,
  TaskPlanScheduleSchema,
  TaskRecurrenceEndKind,
  TaskTimingKind,
  TaskType,
} from '@memoflow/contracts/task';
import { asHm, createTimeFacade, type TimeContext, type TimeFacade } from '@memoflow/time';
import { TaskTimeConfig } from './task-time-config';
import { RecurrenceRule } from './recurrence-rule';

function minutesToHm(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return asHm(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
}

function hmToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function timingFromLegacy(config: TaskTimeConfig): TaskTiming {
  if (config.isAllDay) return { kind: TaskTimingKind.AllDay };
  if (config.isTimePoint) {
    if (config.timePoint == null) throw new Error('TimePoint schedule requires a time');
    return { kind: TaskTimingKind.At, time: minutesToHm(config.timePoint) };
  }
  const range = config.timeRange;
  if (!range) throw new Error('TimeRange schedule requires a window');
  return {
    kind: TaskTimingKind.Window,
    start: minutesToHm(range.start),
    end: minutesToHm(range.end),
  };
}

function timingToLegacy(timing: TaskTiming, date: Ymd, facade: TimeFacade) {
  const ymd = facade.codec.parseYmd(date, { onInvalid: 'throw' });
  if (!ymd) throw new Error(`Invalid Task schedule date: ${date}`);
  const anchor = facade.codec.startOfYmd(ymd);
  if (timing.kind === TaskTimingKind.AllDay) return TaskTimeConfig.createAllDay(anchor);
  if (timing.kind === TaskTimingKind.At) {
    return TaskTimeConfig.createTimePoint(anchor, hmToMinutes(timing.time));
  }
  return TaskTimeConfig.createTimeRange(anchor, hmToMinutes(timing.start), hmToMinutes(timing.end));
}

/** Canonical Task Plan schedule value object (ADR-072). */
export class TaskPlanSchedule extends ValueObject<TaskPlanScheduleDTO> {
  private constructor(props: TaskPlanScheduleDTO) {
    super(props);
  }

  static create(props: TaskPlanScheduleDTO): TaskPlanSchedule {
    return new TaskPlanSchedule(TaskPlanScheduleSchema.parse(props));
  }

  /** Explicit-context legacy decoder for bounded persistence/migration adapters. */
  static fromLegacy(
    taskType: (typeof TaskType)[keyof typeof TaskType],
    timeConfig: TaskTimeConfig | null,
    recurrenceRule: RecurrenceRule | null,
    timeContext: TimeContext,
  ): TaskPlanSchedule {
    if (timeConfig?.startDate == null) {
      throw new Error('Task Plan schedule requires a calendar date');
    }
    const facade = createTimeFacade({ context: timeContext });
    const startDay = facade.calendar.toYmd(timeConfig.startDate);
    const timing = timingFromLegacy(timeConfig);
    if (taskType === TaskType.OneTime) {
      if (recurrenceRule) throw new Error('One-time Task Plan cannot have recurrence');
      return TaskPlanSchedule.create({
        kind: TaskPlanScheduleKind.OneTime,
        date: startDay,
        timing,
      });
    }
    if (!recurrenceRule) throw new Error('Recurring Task Plan requires recurrence');
    const recurrence: TaskRecurrence = {
      frequency: recurrenceRule.frequency,
      interval: recurrenceRule.interval,
      byWeekday: recurrenceRule.daysOfWeek,
      end:
        recurrenceRule.occurrences != null
          ? { kind: TaskRecurrenceEndKind.Count, count: recurrenceRule.occurrences }
          : recurrenceRule.endDate != null
            ? {
                kind: TaskRecurrenceEndKind.Until,
                date: facade.calendar.toYmd(recurrenceRule.endDate),
              }
            : { kind: TaskRecurrenceEndKind.Never },
    };
    return TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.Recurring,
      startDate: startDay,
      timing,
      recurrence,
    });
  }

  get kind() {
    return this.props.kind;
  }

  get isRecurring(): boolean {
    return this.props.kind === TaskPlanScheduleKind.Recurring;
  }

  get calendarDate() {
    return this.props.kind === TaskPlanScheduleKind.OneTime
      ? this.props.date
      : this.props.startDate;
  }

  get timing(): TaskTiming {
    return { ...this.props.timing } as TaskTiming;
  }

  get recurrence(): TaskRecurrence | null {
    return this.props.kind === TaskPlanScheduleKind.Recurring
      ? {
          ...this.props.recurrence,
          byWeekday: [...this.props.recurrence.byWeekday],
          end: { ...this.props.recurrence.end },
        }
      : null;
  }

  toDTO(): TaskPlanScheduleDTO {
    return structuredClone(this.props);
  }

  /** Explicit-context legacy projection for bounded persistence/migration adapters. */
  toLegacyTimeConfig(timeContext: TimeContext): TaskTimeConfig {
    return timingToLegacy(
      this.props.timing,
      this.calendarDate,
      createTimeFacade({ context: timeContext }),
    );
  }

  /** Product-Time-aware recurrence projection for current Task consumers. */
  toLegacyRecurrenceRule(timeContext: TimeContext): RecurrenceRule | null {
    if (this.props.kind !== TaskPlanScheduleKind.Recurring) return null;
    const facade = createTimeFacade({ context: timeContext });
    const end = this.props.recurrence.end;
    return RecurrenceRule.create({
      frequency: this.props.recurrence.frequency,
      interval: this.props.recurrence.interval,
      daysOfWeek: [...this.props.recurrence.byWeekday],
      endDate: end.kind === TaskRecurrenceEndKind.Until ? facade.codec.startOfYmd(end.date) : null,
      occurrences: end.kind === TaskRecurrenceEndKind.Count ? end.count : null,
    });
  }
}
