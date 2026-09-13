import { ValueObject } from '@memoflow/utils/domain';
import type {
  TaskPlanSchedule as TaskPlanScheduleDTO,
  TaskTiming,
  TaskRecurrence,
} from '@memoflow/contracts/task';
import {
  TaskPlanScheduleKind,
  TaskPlanScheduleSchema,
  TaskRecurrenceEndKind,
  TaskType,
} from '@memoflow/contracts/task';
import { createTimeFacade, type TimeContext } from '@memoflow/time';
import { TaskTimeConfig } from './task-time-config';
import { RecurrenceRule } from './recurrence-rule';
import { taskTimingFromLegacy, taskTimingToLegacy } from './task-timing-conversion';

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
    const timing = taskTimingFromLegacy(timeConfig);
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
    return taskTimingToLegacy(this.props.timing, this.calendarDate, timeContext);
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
