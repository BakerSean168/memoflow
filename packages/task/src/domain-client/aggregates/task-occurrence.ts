/**
 * TaskOccurrence Aggregate Root - Domain Client
 *
 * TASK-7306: client state mirrors canonical TaskOccurrence transport.
 */

import type { TaskOccurrenceId } from '@memoflow/contracts/primitives';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { AggregateRoot } from '@memoflow/utils/domain';

export type TaskOccurrenceState = TaskOccurrenceClientDTO;

export class TaskOccurrence extends AggregateRoot<TaskOccurrenceId> {
  private readonly _props: TaskOccurrenceState;

  private constructor(props: TaskOccurrenceState) {
    super(props.id);
    this._props = structuredClone(props);
  }

  get planId() {
    return this._props.planId;
  }
  get identityId() {
    return this._props.identityId;
  }
  get occurrenceKey() {
    return this._props.occurrenceKey;
  }
  get scheduleSnapshot() {
    return structuredClone(this._props.scheduleSnapshot);
  }
  get scheduleDate() {
    return this._props.scheduleSnapshot.date;
  }
  get importanceSnapshot() {
    return this._props.importanceSnapshot;
  }
  get status() {
    return this._props.status;
  }
  get actualStartAt() {
    return this._props.actualStartAt;
  }
  get result() {
    return this._props.result ? structuredClone(this._props.result) : null;
  }
  get checklistState() {
    return structuredClone(this._props.checklistState);
  }
  get dueAt() {
    return this._props.dueAt;
  }
  get isOverdue() {
    return this._props.isOverdue;
  }
  get version() {
    return this._props.version;
  }
  get createdAt() {
    return this._props.createdAt;
  }
  get updatedAt() {
    return this._props.updatedAt;
  }
  get deletedAt() {
    return this._props.deletedAt;
  }

  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }
  get isCompleted(): boolean {
    return this._props.status === 'Completed';
  }
  get isSkipped(): boolean {
    return this._props.status === 'Skipped';
  }

  static load(state: TaskOccurrenceState): TaskOccurrence {
    return new TaskOccurrence(state);
  }

  toDTO(): TaskOccurrenceClientDTO {
    return structuredClone(this._props);
  }
}
