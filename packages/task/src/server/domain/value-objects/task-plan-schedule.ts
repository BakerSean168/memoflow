import { ValueObject } from '@memoflow/utils/domain';
import type {
  TaskPlanSchedule as TaskPlanScheduleDTO,
  TaskTiming,
  TaskRecurrence,
} from '@memoflow/contracts/task';
import {
  TaskPlanScheduleKind,
  TaskPlanScheduleSchema,
} from '@memoflow/contracts/task';

/** Canonical Task Plan schedule value object (ADR-072). */
export class TaskPlanSchedule extends ValueObject<TaskPlanScheduleDTO> {
  private constructor(props: TaskPlanScheduleDTO) {
    super(props);
  }

  static create(props: TaskPlanScheduleDTO): TaskPlanSchedule {
    return new TaskPlanSchedule(TaskPlanScheduleSchema.parse(props));
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

}
