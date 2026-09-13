import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import type {
  ChecklistItemDefinitionDTO,
  TaskEventMap,
  TaskGoalBindingDTO,
  TaskOccurrenceChecklistItem,
  TaskOccurrenceClientDTO,
  TaskOccurrenceResult,
  TaskOccurrenceServerDTO,
} from '@memoflow/contracts/task';
import {
  TaskOccurrenceChecklistItemSchema,
  TaskOccurrenceResultKind,
  TaskOccurrenceResultSchema,
  TaskOccurrenceStatus,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeFacade, type TimeContext } from '@memoflow/time';
import { AggregateRoot } from '@memoflow/utils/domain';
import { TaskOccurrenceId } from '../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import { TaskOccurrenceScheduleSnapshot } from '../value-objects';
import { buildTaskOccurrenceOccurrenceKeyFromDate } from '../value-objects/task-occurrence-occurrence-key';

export interface TaskOccurrenceState {
  id: TaskOccurrenceId;
  planId: TaskPlanId;
  identityId: IdentityId;
  occurrenceKey: string;
  scheduleSnapshot: TaskOccurrenceScheduleSnapshot;
  importanceSnapshot: ImportanceLevel;
  status: TaskOccurrenceStatus;
  actualStartAt: Instant | null;
  result: TaskOccurrenceResult | null;
  checklistState: TaskOccurrenceChecklistItem[];
  createdAt: Instant;
  updatedAt: Instant;
  version: number;
  deletedAt: Instant | null;
}

function cloneResult(result: TaskOccurrenceResult | null): TaskOccurrenceResult | null {
  return result ? structuredClone(result) : null;
}

function validateStatusResultInvariant(
  status: TaskOccurrenceStatus,
  result: TaskOccurrenceResult | null,
): void {
  if (status === TaskOccurrenceStatus.Completed) {
    if (result?.kind !== TaskOccurrenceResultKind.Completed) {
      throw new Error('Completed TaskOccurrence requires a Completed result');
    }
    return;
  }
  if (status === TaskOccurrenceStatus.Missed) {
    if (result?.kind !== TaskOccurrenceResultKind.Missed) {
      throw new Error('Missed TaskOccurrence requires a Missed result');
    }
    return;
  }
  if (status === TaskOccurrenceStatus.Skipped) {
    if (result?.kind !== TaskOccurrenceResultKind.Skipped) {
      throw new Error('Skipped TaskOccurrence requires a Skipped result');
    }
    return;
  }
  if (result !== null) {
    throw new Error('Pending/InProgress TaskOccurrence cannot carry a terminal result');
  }
}

/** TaskOccurrence aggregate root. Execution/reality facts only. */
export class TaskOccurrence extends AggregateRoot<TaskOccurrenceId> {
  private _props: TaskOccurrenceState;

  private constructor(state: TaskOccurrenceState) {
    super(state.id);
    if (!Object.values(TaskOccurrenceStatus).includes(state.status)) {
      throw new Error(`Invalid persisted TaskOccurrenceStatus: ${String(state.status)}`);
    }
    validateStatusResultInvariant(state.status, state.result);
    this._props = {
      ...state,
      result: state.result ? TaskOccurrenceResultSchema.parse(state.result) : null,
      checklistState: state.checklistState.map((item) =>
        TaskOccurrenceChecklistItemSchema.parse(item),
      ),
    };
  }

  get planId(): TaskPlanId {
    return this._props.planId;
  }

  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get occurrenceKey(): string {
    return this._props.occurrenceKey;
  }

  get scheduleSnapshot(): TaskOccurrenceScheduleSnapshot {
    return this._props.scheduleSnapshot;
  }

  get scheduleDate(): Ymd {
    return this._props.scheduleSnapshot.date;
  }

  get importanceSnapshot(): ImportanceLevel {
    return this._props.importanceSnapshot;
  }

  get status(): TaskOccurrenceStatus {
    return this._props.status;
  }

  get actualStartAt(): Instant | null {
    return this._props.actualStartAt;
  }

  get result(): TaskOccurrenceResult | null {
    return cloneResult(this._props.result);
  }

  get checklistState(): TaskOccurrenceChecklistItem[] {
    return this._props.checklistState.map((item) => ({ ...item }));
  }

  get createdAt(): Instant {
    return this._props.createdAt;
  }

  get updatedAt(): Instant {
    return this._props.updatedAt;
  }

  get version(): number {
    return this._props.version;
  }

  get deletedAt(): Instant | null {
    return this._props.deletedAt;
  }

  scheduledStartOfDayAt(timeContext: TimeContext): Instant {
    const time = createTimeFacade({ context: timeContext });
    const ymd = time.codec.parseYmd(this._props.scheduleSnapshot.date, { onInvalid: 'throw' });
    if (!ymd) throw new Error(`Invalid TaskOccurrence date: ${this._props.scheduleSnapshot.date}`);
    return time.codec.startOfYmd(ymd);
  }

  dueDateAt(timeContext: TimeContext): number {
    return this._props.scheduleSnapshot.dueAt(timeContext);
  }

  private advanceVersion(): void {
    this._props.version += 1;
  }

  start(now = Date.now()): void {
    if (!this.canStart()) throw new Error('Cannot start task in current state');
    this._props.status = TaskOccurrenceStatus.InProgress;
    this._props.actualStartAt = now as Instant;
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
  }

  complete(
    actualDurationMinutes?: number,
    note?: string,
    rating?: number,
    goalContext?: { taskTitle: string; goalBinding: TaskGoalBindingDTO | null },
    now = Date.now(),
  ): void {
    if (!this.canComplete()) throw new Error('Cannot complete task in current state');

    const derivedDuration =
      actualDurationMinutes ??
      (this._props.actualStartAt == null
        ? null
        : Math.max(0, Math.round((now - Number(this._props.actualStartAt)) / 60_000)));
    const result = TaskOccurrenceResultSchema.parse({
      kind: TaskOccurrenceResultKind.Completed,
      recordedAt: now,
      actualDurationMinutes: derivedDuration,
      note: note ?? null,
      rating: rating ?? null,
    });

    this._props.status = TaskOccurrenceStatus.Completed;
    this._props.result = result;
    this._props.updatedAt = now as Instant;
    this.advanceVersion();

    this.addDomainEvent<TaskEventMap['task:instance-completed']>('task:instance-completed', {
      identityId: this._props.identityId,
      taskOccurrenceId: this.id,
      taskPlanId: this._props.planId,
      completedAt: now,
      taskTitle: goalContext?.taskTitle ?? '',
      goalBinding: goalContext?.goalBinding ?? null,
    });
  }

  uncomplete(now = Date.now()): void {
    if (this._props.status !== TaskOccurrenceStatus.Completed) {
      throw new Error('Only a completed task can be uncompleted');
    }
    this._props.status = TaskOccurrenceStatus.Pending;
    this._props.result = null;
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
    this.addDomainEvent<TaskEventMap['task:instance-uncompleted']>('task:instance-uncompleted', {
      identityId: this._props.identityId,
      taskOccurrenceId: this.id,
      taskPlanId: this._props.planId,
      uncompletedAt: now,
    });
  }

  skip(reason?: string, now = Date.now()): void {
    if (!this.canSkip()) throw new Error('Cannot skip task in current state');
    this._props.status = TaskOccurrenceStatus.Skipped;
    this._props.result = TaskOccurrenceResultSchema.parse({
      kind: TaskOccurrenceResultKind.Skipped,
      recordedAt: now,
      reason: reason ?? null,
    });
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
    this.addDomainEvent<TaskEventMap['task:instance-skipped']>('task:instance-skipped', {
      identityId: this._props.identityId,
      taskOccurrenceId: this.id,
      taskPlanId: this._props.planId,
      skippedAt: now,
      reason: reason ?? null,
    });
  }

  markMissed(reason?: string, now = Date.now()): void {
    if (!this.canMarkMissed()) throw new Error('Cannot mark task missed in current state');
    this._props.status = TaskOccurrenceStatus.Missed;
    this._props.result = TaskOccurrenceResultSchema.parse({
      kind: TaskOccurrenceResultKind.Missed,
      recordedAt: now,
      reason: reason ?? null,
    });
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
  }

  reschedule(
    next: TaskOccurrenceScheduleSnapshot,
    timeContext: TimeContext,
    now = Date.now(),
  ): boolean {
    if (!this.canReschedule()) throw new Error('Cannot reschedule task in current state');
    // Resolve the new wall-clock fact before mutating aggregate state. Invalid/DST-gap
    // snapshots fail closed without leaving an in-memory partial mutation behind.
    next.dueAt(timeContext);
    if (JSON.stringify(next.toDTO()) === JSON.stringify(this._props.scheduleSnapshot.toDTO())) {
      return false;
    }

    const previousDueDate = this.dueDateAt(timeContext);
    this._props.scheduleSnapshot = next;
    this._props.occurrenceKey = buildTaskOccurrenceOccurrenceKeyFromDate(
      String(this._props.planId),
      next.date,
    );
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
    const newDueDate = this.dueDateAt(timeContext);
    this.addDomainEvent<TaskEventMap['task:rescheduled']>('task:rescheduled', {
      identityId: this._props.identityId,
      taskOccurrenceId: this.id,
      taskPlanId: this._props.planId,
      previousDueDate,
      newDueDate,
    });
    return true;
  }

  canReschedule(): boolean {
    return (
      this._props.status === TaskOccurrenceStatus.Pending ||
      this._props.status === TaskOccurrenceStatus.InProgress
    );
  }

  applyPlanProjection(params: {
    effectiveFrom: Ymd;
    timing?: ReturnType<TaskOccurrenceScheduleSnapshot['toDTO']>['timing'];
    importance?: ImportanceLevel;
  }): boolean {
    if (
      this._props.status !== TaskOccurrenceStatus.Pending ||
      this._props.scheduleSnapshot.date <= params.effectiveFrom
    ) {
      return false;
    }

    let changed = false;
    if (params.timing !== undefined) {
      this._props.scheduleSnapshot = TaskOccurrenceScheduleSnapshot.create({
        date: this._props.scheduleSnapshot.date,
        timing: params.timing,
      });
      changed = true;
    }
    if (params.importance !== undefined && params.importance !== this._props.importanceSnapshot) {
      this._props.importanceSnapshot = params.importance;
      changed = true;
    }
    if (changed) {
      this._props.updatedAt = Date.now() as Instant;
      this.advanceVersion();
    }
    return changed;
  }

  completeChecklistItem(definitionId: string, now = Date.now()): void {
    const item = this._props.checklistState.find(
      (candidate) => candidate.definitionId === definitionId,
    );
    if (!item) throw new Error(`Checklist item ${definitionId} not found`);
    if (item.completed) return;
    item.completed = true;
    item.completedAt = now;
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
  }

  uncompleteChecklistItem(definitionId: string, now = Date.now()): void {
    const item = this._props.checklistState.find(
      (candidate) => candidate.definitionId === definitionId,
    );
    if (!item) throw new Error(`Checklist item ${definitionId} not found`);
    if (!item.completed) return;
    item.completed = false;
    item.completedAt = null;
    this._props.updatedAt = now as Instant;
    this.advanceVersion();
  }

  canStart(): boolean {
    return this._props.status === TaskOccurrenceStatus.Pending;
  }

  canComplete(): boolean {
    return (
      this._props.status === TaskOccurrenceStatus.Pending ||
      this._props.status === TaskOccurrenceStatus.InProgress ||
      this._props.status === TaskOccurrenceStatus.Missed ||
      this._props.status === TaskOccurrenceStatus.Skipped
    );
  }

  canSkip(): boolean {
    return (
      this._props.status === TaskOccurrenceStatus.Pending ||
      this._props.status === TaskOccurrenceStatus.InProgress
    );
  }

  canMarkMissed(): boolean {
    return (
      this._props.status === TaskOccurrenceStatus.Pending ||
      this._props.status === TaskOccurrenceStatus.InProgress
    );
  }

  isOverdueAt(timeContext: TimeContext, now = Date.now()): boolean {
    if (
      this._props.status !== TaskOccurrenceStatus.Pending &&
      this._props.status !== TaskOccurrenceStatus.InProgress
    ) {
      return false;
    }
    return now > this.dueDateAt(timeContext);
  }

  toPersistenceState(): TaskOccurrenceServerDTO {
    return {
      id: this.id.toString() as TaskOccurrenceId,
      planId: this._props.planId.toString() as TaskPlanId,
      identityId: this._props.identityId.toString() as IdentityId,
      occurrenceKey: this._props.occurrenceKey,
      scheduleSnapshot: this._props.scheduleSnapshot.toDTO(),
      importanceSnapshot: this._props.importanceSnapshot,
      status: this._props.status,
      actualStartAt: this._props.actualStartAt,
      result: cloneResult(this._props.result),
      checklistState: this.checklistState,
      version: this._props.version,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt,
    };
  }

  toServerDTO(): TaskOccurrenceServerDTO {
    return this.toPersistenceState();
  }

  /** Compatibility wrapper retained only until callers migrate from the old signature. */
  toServerDTOAt(_timeContext: TimeContext): TaskOccurrenceServerDTO {
    return this.toServerDTO();
  }

  /** Canonical transport projection plus Product-Time derived read fields. */
  toClientDTOAt(timeContext: TimeContext, now = Date.now()): TaskOccurrenceClientDTO {
    return {
      ...this.toPersistenceState(),
      dueAt: this.dueDateAt(timeContext),
      isOverdue: this.isOverdueAt(timeContext, now),
    };
  }

  static create(params: {
    planId: TaskPlanId;
    identityId: IdentityId;
    scheduleSnapshot: TaskOccurrenceScheduleSnapshot;
    importanceSnapshot: ImportanceLevel;
    checklistDefinition?: readonly ChecklistItemDefinitionDTO[];
  }): TaskOccurrence {
    if (!params.planId) throw new Error('Plan ID is required');
    if (!params.identityId) throw new Error('Identity ID is required');

    const now = Date.now() as Instant;
    const checklistState = (params.checklistDefinition ?? []).map((definition) =>
      TaskOccurrenceChecklistItemSchema.parse({
        definitionId: definition.id,
        titleSnapshot: definition.title,
        orderSnapshot: definition.order,
        completed: false,
        completedAt: null,
      }),
    );

    return new TaskOccurrence({
      id: TaskOccurrenceId.generate(),
      planId: params.planId,
      identityId: params.identityId,
      occurrenceKey: buildTaskOccurrenceOccurrenceKeyFromDate(
        String(params.planId),
        params.scheduleSnapshot.date,
      ),
      scheduleSnapshot: params.scheduleSnapshot,
      importanceSnapshot: params.importanceSnapshot,
      status: TaskOccurrenceStatus.Pending,
      actualStartAt: null,
      result: null,
      checklistState,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
    });
  }

  static load(state: TaskOccurrenceState): TaskOccurrence {
    return new TaskOccurrence(state);
  }
}
