import type { TaskOccurrenceScheduleSnapshot as TaskOccurrenceScheduleSnapshotDTO } from '@memoflow/contracts/task';
import { TaskOccurrenceScheduleSnapshotSchema } from '@memoflow/contracts/task';
import type { Instant } from '@memoflow/contracts/primitives';
import type { TimeContext } from '@memoflow/time';
import { ValueObject } from '@memoflow/utils/domain';
import { taskTimingDueAt } from './task-timing-conversion';

/** Immutable ADR-071 schedule snapshot owned by one TaskOccurrence. */
export class TaskOccurrenceScheduleSnapshot extends ValueObject<TaskOccurrenceScheduleSnapshotDTO> {
  private constructor(props: TaskOccurrenceScheduleSnapshotDTO) {
    super(props);
  }

  static create(props: TaskOccurrenceScheduleSnapshotDTO): TaskOccurrenceScheduleSnapshot {
    return new TaskOccurrenceScheduleSnapshot(TaskOccurrenceScheduleSnapshotSchema.parse(props));
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

  toDTO(): TaskOccurrenceScheduleSnapshotDTO {
    return structuredClone(this.props);
  }
}
