import type { TaskOccurrenceScheduleSnapshot as TaskOccurrenceScheduleSnapshotDTO } from '@memoflow/contracts/task';
import { TaskOccurrenceScheduleSnapshotSchema } from '@memoflow/contracts/task';
import type { Instant } from '@memoflow/contracts/primitives';
import { ValueObject } from '@memoflow/utils/domain';
import { createTimeFacade, type TimeContext } from '@memoflow/time';
import { TaskTimeConfig } from './task-time-config';
import {
  taskTimingDueAt,
  taskTimingFromLegacy,
  taskTimingToLegacy,
} from './task-timing-conversion';

/** Immutable ADR-071 schedule snapshot owned by one TaskOccurrence. */
export class TaskOccurrenceScheduleSnapshot extends ValueObject<TaskOccurrenceScheduleSnapshotDTO> {
  private constructor(props: TaskOccurrenceScheduleSnapshotDTO) {
    super(props);
  }

  static create(props: TaskOccurrenceScheduleSnapshotDTO): TaskOccurrenceScheduleSnapshot {
    return new TaskOccurrenceScheduleSnapshot(TaskOccurrenceScheduleSnapshotSchema.parse(props));
  }

  static fromLegacy(
    instanceDate: number,
    timeConfig: TaskTimeConfig,
    timeContext: TimeContext,
  ): TaskOccurrenceScheduleSnapshot {
    const facade = createTimeFacade({ context: timeContext });
    return TaskOccurrenceScheduleSnapshot.create({
      date: facade.calendar.toYmd(instanceDate),
      timing: taskTimingFromLegacy(timeConfig),
    });
  }

  get date() {
    return this.props.date;
  }

  get timing() {
    return structuredClone(this.props.timing);
  }

  dueAt(timeContext: TimeContext): Instant {
    return taskTimingDueAt(this.props.timing, this.props.date, timeContext);
  }

  toLegacyTimeConfig(timeContext: TimeContext): TaskTimeConfig {
    return taskTimingToLegacy(this.props.timing, this.props.date, timeContext);
  }

  toDTO(): TaskOccurrenceScheduleSnapshotDTO {
    return structuredClone(this.props);
  }
}
