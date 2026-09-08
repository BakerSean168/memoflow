/**
 * TaskPlan aggregate (Server)
 */

import type { LabelClientDTO } from '@memoflow/contracts/label';
import type {
  TaskPlanClientDTO,
  TaskPlanServerDTO,
  TaskEventMap,
  GoalContributionRule,
} from '@memoflow/contracts/task';
import {
  RecurrenceEndConditionType,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskType } from '../value-objects';
import { TaskOccurrenceStatus, TaskTimeType as TimeType } from '../../domain/value-objects';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import type { TaskOccurrenceId } from '../../domain/value-objects/task-occurrence-id';
import { IdentityId } from '@memoflow/domain-shared';
import type { Instant } from '@memoflow/contracts/primitives';
import { createTimeFacade } from '@memoflow/time';

const taskTime = createTimeFacade();

import { AggregateRoot } from '@memoflow/utils/domain';
import {
  TaskTimeConfig,
  RecurrenceRule,
  TaskReminderConfig,
  TaskGoalBinding,
  ChecklistItemDefinition,
} from '../value-objects';
import { TaskPlanHistory } from '../entities';
import { TaskOccurrence } from './task-occurrence';
import type { TaskPlanProps, TaskPlanState } from './task-plan.state';
import * as instanceGen from './instance-generation.policy';
import * as goalPolicy from './task-plan-goal.policy';
import * as lifecyclePolicy from './task-plan-lifecycle.policy';
import * as recurrencePolicy from './task-plan-recurrence.policy';
import { InvalidTaskPlanStateError, InvalidDateRangeError } from '../value-objects/task-errors';

/** TaskPlan aggregate root. */
export class TaskPlan extends AggregateRoot<TaskPlanId> {
  private _props: TaskPlanProps;

  // ===== Child entity collections =====
  private _history: TaskPlanHistory[];
  private _instances: TaskOccurrence[];
  private _labelProjection: LabelClientDTO[] = [];

  // ===== Constructor (use factory methods to create) =====
  protected constructor(state: TaskPlanState) {
    super(state.id);
    if (!TaskPlanStatus.isValid(String(state.status))) {
      throw new InvalidTaskPlanStateError(
        `Invalid persisted TaskPlanStatus: ${String(state.status)}`,
        {
          templateId: state.id,
          currentStatus: state.status,
          attemptedAction: 'load',
        },
      );
    }
    if (state.outcome !== undefined && !Object.values(TaskPlanOutcome).includes(state.outcome)) {
      throw new InvalidTaskPlanStateError(
        `Invalid persisted TaskPlanOutcome: ${String(state.outcome)}`,
        {
          templateId: state.id,
          currentStatus: state.status,
          attemptedAction: 'load',
        },
      );
    }

    const { id: _, ...rest } = state;
    this._props = {
      ...rest,
      description: rest.description ?? null,
      goalBinding: rest.goalBinding ?? null,
      timeConfig: rest.timeConfig ?? null,
      recurrenceRule: rest.recurrenceRule ?? null,
      reminderConfig: rest.reminderConfig ?? null,
      lastGeneratedDate: rest.lastGeneratedDate ?? null,
      generateAheadDays: rest.generateAheadDays ?? null,
      checklist: rest.checklist ?? [],
      startDate: rest.startDate ?? null,
      dueDate: rest.dueDate ?? null,
      completedAt: rest.completedAt ?? null,
      estimatedMinutes: rest.estimatedMinutes ?? null,
      actualMinutes: rest.actualMinutes ?? null,
      note: rest.note ?? null,
      outcome: rest.outcome ?? TaskPlanOutcome.Open,
      completionPolicy: rest.completionPolicy ?? TaskPlanCompletionPolicy.AllowCorrection,
      closedAt: rest.closedAt ?? null,
      archivedAt: rest.archivedAt ?? null,
      abandonedReason: rest.abandonedReason ?? null,
      deletedAt: rest.deletedAt ?? null,
      version: rest.version ?? 1,
    };

    this._history = [];
    this._instances = [];
  }

  private static instantiate(state: TaskPlanState): TaskPlan {
    return new TaskPlan(state);
  }

  /** Publish a domain event — used by factory after construction. */
  publishDomainEvent<T>(eventName: string, payload: T): void {
    this.addDomainEvent(eventName, payload);
  }

  private static assertValidDateRange(
    startDate: Instant | null | undefined,
    dueDate: Instant | null | undefined,
  ): void {
    if (!startDate || !dueDate) return;
    if (startDate > dueDate) {
      throw new InvalidDateRangeError(startDate, dueDate);
    }
  }

  private static assertIdentityId(identityId: IdentityId, attemptedAction: string): void {
    if (identityId) {
      return;
    }

    throw new InvalidTaskPlanStateError('Identity ID is required', {
      templateId: '',
      currentStatus: 'N/A',
      attemptedAction,
    });
  }

  private static normalizeTitle(title: string, attemptedAction: string): string {
    if (!title || title.trim().length === 0) {
      throw new InvalidTaskPlanStateError('Title is required', {
        templateId: '',
        currentStatus: 'N/A',
        attemptedAction,
      });
    }

    return title.trim();
  }

  // ===== Getters =====

  public get identityId(): IdentityId {
    return this._props.identityId;
  }

  public get name(): string {
    return this._props.title;
  }

  public get labels(): readonly LabelClientDTO[] {
    return this._labelProjection.map((label) => ({ ...label }));
  }

  /** Hydrates shared labels for read projection only; Task business state is unchanged. */
  public hydrateLabels(labels: readonly LabelClientDTO[]): void {
    this._labelProjection = labels.map((label) => ({ ...label }));
  }

  public get title(): string {
    return this._props.title;
  }

  public get description(): string | null {
    return this._props.description;
  }

  public get taskType(): TaskType {
    return this._props.taskType;
  }

  public get timeConfig(): TaskTimeConfig | null {
    return this._props.timeConfig;
  }

  public get recurrenceRule(): RecurrenceRule | null {
    return this._props.recurrenceRule;
  }

  public get reminderConfig(): TaskReminderConfig | null {
    return this._props.reminderConfig;
  }

  public get importance(): ImportanceLevel {
    return this._props.importance;
  }

  public get goalBinding(): TaskGoalBinding | null {
    return this._props.goalBinding;
  }

  public get status(): TaskPlanStatus {
    return this._props.status;
  }

  public get outcome() {
    return this._props.outcome;
  }

  public get completionPolicy() {
    return this._props.completionPolicy;
  }

  public get closedAt(): Instant | null {
    return this._props.closedAt;
  }

  public get archivedAt(): Instant | null {
    return this._props.archivedAt;
  }

  public get abandonedReason(): string | null {
    return this._props.abandonedReason;
  }

  public get lastGeneratedDate(): Instant | null {
    const v = this._props.lastGeneratedDate;
    if (v == null) return null;
    return v as Instant;
  }

  public get generateAheadDays(): number | null {
    return this._props.generateAheadDays;
  }

  public get checklist(): ChecklistItemDefinition[] {
    return [...this._props.checklist];
  }

  public get startDate(): Instant | null {
    const v = this._props.startDate;
    if (v == null) return null;
    return v as Instant;
  }

  public get dueDate(): Instant | null {
    const v = this._props.dueDate;
    if (v == null) return null;
    return v as Instant;
  }

  public get completedAt(): Instant | null {
    const v = this._props.completedAt;
    if (v == null) return null;
    return v as Instant;
  }

  public get estimatedMinutes(): number | null {
    return this._props.estimatedMinutes;
  }

  public get actualMinutes(): number | null {
    return this._props.actualMinutes;
  }

  public get note(): string | null {
    return this._props.note;
  }

  public get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }

  public get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  public get deletedAt(): Instant | null {
    const v = this._props.deletedAt;
    if (v == null) return null;
    return v as Instant;
  }

  public get version(): number {
    return this._props.version;
  }

  /** R2-5a：编辑后递增版本（乐观锁；调用方在写回前调用一次）。 */
  public advanceVersion(): void {
    this._props.version += 1;
  }

  public get history(): TaskPlanHistory[] {
    return this._history;
  }

  public get instances(): TaskOccurrence[] {
    return [...this._instances];
  }

  /** Internal props — used by extracted policy modules. */
  get props(): TaskPlanProps {
    return this._props;
  }

  // ===== Instance Generation Methods (delegated to instance-generation.policy) =====

  /** Generates task instances within the specified date range. */
  public generateInstances(fromDate: number, toDate: number): TaskOccurrence[] {
    const { instances, lastGeneratedDate } = instanceGen.generateInstances(
      this.getInstanceContext(),
      fromDate,
      toDate,
    );
    this._instances.push(...instances);
    if (lastGeneratedDate) {
      this._props.lastGeneratedDate = lastGeneratedDate;
      this._props.updatedAt = Date.now();
      this.addDomainEvent<TaskEventMap['task:instance-generated']>('task:instance-generated', {
        identityId: this._props.identityId,
        templateId: this.id,
        templateTitle: this.title,
        instanceCount: instances.length,
        strategy: instances.length <= 20 ? 'full' : 'summary',
      });
    }
    return instances;
  }

  /** Gets the task instance for a specific date. */
  public getInstanceForDate(date: number): TaskOccurrence | null {
    const targetDay = TaskPlan.startOfLocalDay(date);
    return (
      this._instances.find((i) => TaskPlan.startOfLocalDay(i.instanceDate) === targetDay) ??
      null
    );
  }

  /** Determines whether an instance should be generated for the given date. */
  public shouldGenerateInstance(date: number): boolean {
    return instanceGen.shouldGenerateInstance(this.getInstanceContext(), date);
  }

  private getInstanceContext(): instanceGen.InstanceGenerationContext {
    return {
      templateId: this.id,
      identityId: this._props.identityId,
      status: this._props.status,
      taskType: this._props.taskType,
      timeConfig: this._props.timeConfig,
      recurrenceRule: this._props.recurrenceRule,
      importance: this._props.importance,
      existingInstances: this._instances,
    };
  }

  // ===== State Transition Methods (delegated to task-plan-lifecycle.policy) =====

  public activate(): void {
    lifecyclePolicy.activate(this);
    this.advanceVersion();
  }

  public pause(): void {
    lifecyclePolicy.pause(this);
    this.advanceVersion();
  }

  public updateCompletionPolicy(
    policy: (typeof TaskPlanCompletionPolicy)[keyof typeof TaskPlanCompletionPolicy],
  ): void {
    if (this._props.status === TaskPlanStatus.Closed || this._props.deletedAt !== null) {
      throw new InvalidTaskPlanStateError(
        'Cannot change completion policy on a closed or deleted task plan',
        {
          templateId: this.id,
          currentStatus: this._props.status,
          attemptedAction: 'updateCompletionPolicy',
        },
      );
    }
    this._props.completionPolicy = policy;
    this._props.updatedAt = Date.now();
    this.addHistory('completion_policy_updated', { policy });
  }

  public archive(): void {
    lifecyclePolicy.archive(this);
    this.advanceVersion();
  }

  public abandon(reason?: string): void {
    lifecyclePolicy.abandon(this, reason);
    this.advanceVersion();
  }

  /** Apply deterministic evaluator output and publish the authoritative plan-outcome fact. */
  public applyPlanOutcome(
    outcome:
      | typeof TaskPlanOutcome.Succeeded
      | typeof TaskPlanOutcome.Failed
      | typeof TaskPlanOutcome.Open,
    cause: { triggeringTaskOccurrenceId: TaskOccurrenceId },
  ): void {
    const previousOutcome = this._props.outcome;
    lifecyclePolicy.applyEvaluation(this, outcome);
    this.advanceVersion();

    if (previousOutcome !== this._props.outcome) {
      this.addDomainEvent<TaskEventMap['task:plan-outcome-changed']>('task:plan-outcome-changed', {
        identityId: this._props.identityId,
        taskPlanId: this.id,
        triggeringTaskOccurrenceId: cause.triggeringTaskOccurrenceId,
        taskTitle: this._props.title,
        goalBinding: this._props.goalBinding?.toDTO() ?? null,
        previousOutcome,
        nextOutcome: this._props.outcome,
        planVersion: this.version,
        changedAt: Number(this._props.updatedAt),
      });
    }
  }

  public softDelete(): void {
    lifecyclePolicy.softDelete(this);
    this.advanceVersion();
  }

  public restore(): void {
    lifecyclePolicy.restore(this);
    this.advanceVersion();
  }

  // ===== Time-related methods (delegated to instance-generation.policy) =====

  public isActiveOnDate(date: number): boolean {
    return instanceGen.isActiveOnDate(this.getInstanceContext(), date);
  }

  public getNextOccurrence(afterDate: number): number | null {
    return instanceGen.getNextOccurrence(this.getInstanceContext(), afterDate);
  }

  // ===== One-time task time methods =====

  /** Updates the title. */
  public updateTitle(newTitle: string): void {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new InvalidTaskPlanStateError('Title cannot be empty', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateTitle',
      });
    }
    const oldTitle = this._props.title;
    this._props.title = newTitle.trim();
    this._props.updatedAt = Date.now();
    this.addHistory('title_updated', { oldTitle, newTitle: this._props.title });

    // Publish domain event
    this.addDomainEvent<TaskEventMap['task:updated']>('task:updated', {
      identityId: this._props.identityId,
      task: this.toServerDTO(),
      changes: ['title'],
    });
  }

  /** Updates the description. */
  public updateDescription(newDescription: string | null): void {
    const oldDescription = this._props.description;
    this._props.description = newDescription ? newDescription.trim() : null;
    this._props.updatedAt = Date.now();
    this.addHistory('description_updated', {
      oldDescription,
      newDescription: this._props.description,
    });
  }

  /** Updates the reminder configuration. */
  public updateReminderConfig(newReminderConfig: TaskReminderConfig | null): void {
    const oldReminderConfig = this._props.reminderConfig?.toDTO() ?? null;
    this._props.reminderConfig = newReminderConfig;
    this._props.updatedAt = Date.now();
    this.addHistory('reminder_config_updated', {
      oldReminderConfig,
      newReminderConfig: newReminderConfig?.toDTO() ?? null,
    });

    this.addDomainEvent<TaskEventMap['task:updated']>('task:updated', {
      identityId: this._props.identityId,
      task: this.toServerDTO(),
      changes: ['reminderConfig'],
    });
  }

  /** Updates the start date (OneTime tasks only). */
  public updateStartDate(newStartDate: Instant | null): void {
    if (this._props.taskType !== TaskType.OneTime) {
      throw new InvalidTaskPlanStateError('Only OneTime tasks have start dates', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateStartDate',
      });
    }
    TaskPlan.assertValidDateRange(newStartDate, this._props.dueDate);
    const oldStartDate = this._props.startDate;
    this._props.startDate = newStartDate;
    this._props.updatedAt = Date.now();
    this.addHistory('start_date_updated', { oldStartDate, newStartDate });

    this.addDomainEvent<TaskEventMap['task:template-schedule-time-changed']>(
      'task:template-schedule-time-changed',
      {
        identityId: this._props.identityId,
        taskPlan: this.toServerDTO(),
        oldStartDate: oldStartDate,
        oldDueDate: this._props.dueDate,
        newStartDate: newStartDate,
        newDueDate: this._props.dueDate,
      },
    );
  }

  /** Updates the due date (OneTime tasks only). */
  public updateDueDate(newDueDate: Instant | null): void {
    if (this._props.taskType !== TaskType.OneTime) {
      throw new InvalidTaskPlanStateError('Only OneTime tasks have due dates', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateDueDate',
      });
    }
    TaskPlan.assertValidDateRange(this._props.startDate, newDueDate);
    // Note: TaskPlanStatus doesn't have COMPLETED/CANCELLED states
    // Those are TaskOccurrenceStatus states. This check has been removed.
    const oldDueDate = this._props.dueDate;
    this._props.dueDate = newDueDate;
    this._props.updatedAt = Date.now();
    this.addHistory('due_date_updated', { oldDueDate, newDueDate });

    this.addDomainEvent<TaskEventMap['task:template-schedule-time-changed']>(
      'task:template-schedule-time-changed',
      {
        identityId: this._props.identityId,
        taskPlan: this.toServerDTO(),
        oldStartDate: this._props.startDate,
        oldDueDate: oldDueDate,
        newStartDate: this._props.startDate,
        newDueDate: newDueDate,
      },
    );
  }

  /**
   * Updates the time configuration.
   */
  public updateTimeConfig(newTimeConfig: TaskTimeConfig | null): void {
    if (this._props.taskType === TaskType.Recurring && newTimeConfig?.startDate == null) {
      throw new InvalidTaskPlanStateError('Recurring Task requires a date', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateTimeConfig',
      });
    }
    const oldTimeConfig = this._props.timeConfig?.toDTO() ?? null;
    this._props.timeConfig = newTimeConfig;
    this._props.updatedAt = Date.now();

    this.addHistory('time_config_updated', {
      oldTimeConfig,
      newTimeConfig: newTimeConfig?.toDTO() ?? null,
    });

    this.addDomainEvent<TaskEventMap['task:template-schedule-time-changed']>(
      'task:template-schedule-time-changed',
      {
        identityId: this._props.identityId,
        taskPlan: this.toServerDTO(),
        oldStartDate: this._props.startDate,
        oldDueDate: this._props.dueDate,
        newStartDate: this._props.startDate,
        newDueDate: this._props.dueDate,
        oldTimeConfig,
        newTimeConfig: newTimeConfig?.toDTO() ?? null,
      },
    );
  }

  // ===== Recurrence Methods (delegated to task-plan-recurrence.policy) =====

  public updateRecurrenceRule(newRule: RecurrenceRule): void {
    recurrencePolicy.updateRecurrenceRule(this, newRule);
  }

  public updateRecurrenceEndCondition(
    endConditionType: RecurrenceEndConditionType,
    customValue?: number,
  ): void {
    recurrencePolicy.updateRecurrenceEndCondition(this, endConditionType, customValue);
  }

  /** Updates the importance level. */
  public updatePriority(newImportance: ImportanceLevel): void {
    const oldImportance = this._props.importance;
    this._props.importance = newImportance;
    this._props.updatedAt = Date.now();
    this.addHistory('priority_updated', { oldImportance, newImportance });

    this.addDomainEvent<TaskEventMap['task:updated']>('task:updated', {
      identityId: this._props.identityId,
      task: this.toServerDTO(),
      changes: ['importance'],
    });
  }

  /** Updates the note (OneTime tasks only). */
  public updateNote(newNote: string | null): void {
    if (this._props.taskType !== TaskType.OneTime) {
      throw new InvalidTaskPlanStateError('Only OneTime tasks have notes', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateNote',
      });
    }
    const oldNote = this._props.note;
    this._props.note = newNote;
    this._props.updatedAt = Date.now();
    this.addHistory('note_updated', { oldNote, newNote });
  }

  /** Updates the estimated time (OneTime tasks only). */
  public updateEstimatedTime(estimatedMinutes: number): void {
    if (this._props.taskType !== TaskType.OneTime) {
      throw new InvalidTaskPlanStateError('Only OneTime tasks have estimated time', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateEstimatedTime',
      });
    }
    if (estimatedMinutes < 0) {
      throw new InvalidTaskPlanStateError('Estimated time cannot be negative', {
        templateId: this.id,
        currentStatus: this._props.status,
        attemptedAction: 'updateEstimatedTime',
      });
    }
    const oldEstimatedMinutes = this._props.estimatedMinutes;
    this._props.estimatedMinutes = estimatedMinutes;
    this._props.updatedAt = Date.now();
    this.addHistory('estimated_time_updated', { oldEstimatedMinutes, estimatedMinutes });
  }

  /** Checks whether the task is overdue (OneTime tasks only). */
  public isOverdue(): boolean {
    if (this._props.taskType !== TaskType.OneTime) {
      return false;
    }
    if (!this._props.dueDate) {
      return false;
    }
    // Note: TaskPlanStatus doesn't have COMPLETED/CANCELLED states
    // Those checks have been removed as they belong to TaskOccurrence status
    return Date.now() > this._props.dueDate!;
  }

  /** Gets the number of days until the due date (OneTime tasks only). */
  public getDaysUntilDue(): number | null {
    if (this._props.taskType !== TaskType.OneTime) {
      return null;
    }
    if (!this._props.dueDate) {
      return null;
    }
    const now = Date.now();
    const diffMs = this._props.dueDate! - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // ===== Reminder Methods =====

  /** Checks whether a reminder is configured. */
  public hasReminder(): boolean {
    return this._props.reminderConfig !== null && this._props.reminderConfig.enabled;
  }

  /** Gets the reminder time for a given instance date. */
  public getReminderTime(instanceDate: number): number | null {
    if (!this.hasReminder() || !this._props.reminderConfig) {
      return null;
    }

    // Standardized fallback: return 1 hour before (real implementation should use reminder configuration offset)
    const ONE_HOUR_MS = 3600000;
    return instanceDate - ONE_HOUR_MS;
  }

  // ===== Goal Binding Methods (delegated to task-plan-goal.policy) =====

  public bindToGoal(
    goalId: string,
    keyResultId: string | null = null,
    contribution: GoalContributionRule | null = null,
  ): void {
    goalPolicy.bindToGoal(this, goalId, keyResultId, contribution);
  }

  public unbindFromGoal(): void {
    goalPolicy.unbindFromGoal(this);
  }

  public isLinkedToGoal(): boolean {
    return goalPolicy.isLinkedToGoal(this._props);
  }

  // ===== History Methods =====

  /** Adds a history record. */
  public addHistory(action: string, changes?: unknown): void {
    const history = TaskPlanHistory.create({
      templateId: this.id,
      action,
      changes: changes ? JSON.stringify(changes) : null,
    });
    this._history.push(history);
    this._props.updatedAt = Date.now();
  }

  // ===== Instance Management Methods =====

  /** Creates an instance from this template. */
  public createInstance(params: instanceGen.CreateInstanceParams): string {
    const instance = instanceGen.createInstanceFromTemplate(this.getInstanceContext(), params);
    this._instances.push(instance);
    this._props.updatedAt = Date.now();
    return instance.id;
  }

  /** Adds an existing instance to this template. */
  public addInstance(instance: TaskOccurrence): void {
    this._instances.push(instance);
    this._props.updatedAt = Date.now();
  }

  /** Removes an instance by ID. */
  public removeInstance(instanceId: string): TaskOccurrence | null {
    const index = this._instances.findIndex((i) => i.id === instanceId);
    if (index === -1) return null;
    const [removed] = this._instances.splice(index, 1);
    this._props.updatedAt = Date.now();
    return removed;
  }

  /** Gets an instance by ID. */
  public getInstance(instanceId: string): TaskOccurrence | null {
    return this._instances.find((i) => i.id === instanceId) ?? null;
  }

  /** Gets all instances. */
  public getAllInstances(): TaskOccurrence[] {
    return [...this._instances];
  }

  // ===== DTO Conversion =====

  public toServerDTO(includeChildren: boolean = false): TaskPlanServerDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.title,
      description: this._props.description,
      timeConfig: this._props.timeConfig?.toDTO() ?? null,
      recurrenceRule: this._props.recurrenceRule?.toDTO() ?? null,
      reminderConfig: this._props.reminderConfig?.toDTO() ?? null,
      importance: this._props.importance,
      goalBinding: this._props.goalBinding?.toDTO() ?? null,
      checklist: this._props.checklist.map((item) => item.toDTO()),
      status: this._props.status,
      outcome: this._props.outcome,
      completionPolicy: this._props.completionPolicy,
      closedAt: this._props.closedAt,
      archivedAt: this._props.archivedAt,
      abandonedReason: this._props.abandonedReason,
      lastGeneratedDate: this._props.lastGeneratedDate ?? null,
      generateAheadDays: this._props.generateAheadDays,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt ?? null,
      version: this._props.version,
      instances: includeChildren
        ? this._instances.map((instance) => instance.toServerDTO())
        : undefined,
    };
  }

  public toClientDTO(includeChildren: boolean = false): TaskPlanClientDTO {
    const asOf = Date.now();
    const completionWindowDays = 30 as const;
    const completionWindowStart = asOf - completionWindowDays * 24 * 60 * 60 * 1000;
    const completedCount = this._instances.filter(
      (instance) => instance.status === TaskOccurrenceStatus.Completed,
    ).length;
    const pendingCount = this._instances.filter(
      (instance) => instance.status === TaskOccurrenceStatus.Pending,
    ).length;
    const totalCount = this._instances.length;
    const dueInstances = this._instances.filter(
      (instance) => instance.instanceDate >= completionWindowStart && instance.instanceDate <= asOf,
    );
    const completedDueInstanceCount = dueInstances.filter(
      (instance) => instance.status === TaskOccurrenceStatus.Completed,
    ).length;
    const completionRate =
      dueInstances.length > 0
        ? Math.round((completedDueInstanceCount / dueInstances.length) * 100)
        : 0;

    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.title,
      description: this._props.description,
      timeConfig: this._props.timeConfig?.toDTO() ?? {
        timeType: TimeType.AllDay,
        startDate: null,
        timePoint: null,
        timeRange: null,
      },
      recurrenceRule: this._props.recurrenceRule?.toDTO() ?? null,
      reminderConfig: this._props.reminderConfig?.toDTO() ?? null,
      importance: this._props.importance,
      goalBinding: this._props.goalBinding?.toDTO() ?? null,
      labels: this._labelProjection.map((label) => ({ ...label })),
      status: this._props.status,
      outcome: this._props.outcome,
      completionPolicy: this._props.completionPolicy,
      closedAt: this._props.closedAt,
      archivedAt: this._props.archivedAt,
      abandonedReason: this._props.abandonedReason,
      lastGeneratedDate: this._props.lastGeneratedDate ?? null,
      generateAheadDays: this._props.generateAheadDays,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt ?? null,
      version: this._props.version,
      startDate: this._props.startDate ?? null,
      dueDate: this._props.dueDate ?? null,
      completedAt: this._props.completedAt ?? null,
      estimatedMinutes: this._props.estimatedMinutes,
      actualMinutes: this._props.actualMinutes,
      comment: this._props.note,
      history: includeChildren ? this._history.map((entry) => entry.toClientDTO()) : undefined,
      instances: includeChildren
        ? this._instances.map((instance) => instance.toClientDTO())
        : undefined,
      instanceCount: totalCount,
      completedInstanceCount: completedCount,
      pendingInstanceCount: pendingCount,
      dueInstanceCount: dueInstances.length,
      completedDueInstanceCount,
      completionWindowDays,
      futurePendingInstanceCount: this._instances.filter(
        (instance) =>
          instance.status === TaskOccurrenceStatus.Pending && instance.instanceDate > asOf,
      ).length,
      singleInstanceStatus: this._instances.length === 1 ? this._instances[0].status : null,
      completionRate,
    };
  }

  // ===== Factory Methods =====

  public static createOneTimeTask(params: {
    id?: TaskPlanId;
    identityId: IdentityId;
    title: string;
    description?: string;
    importance?: ImportanceLevel;
    startDate?: Instant;
    dueDate?: Instant;
    estimatedMinutes?: number;
    note?: string;
  }): TaskPlan {
    TaskPlan.assertIdentityId(params.identityId, 'createOneTimeTask');
    const title = TaskPlan.normalizeTitle(params.title, 'createOneTimeTask');
    TaskPlan.assertValidDateRange(params.startDate ?? null, params.dueDate ?? null);

    const now = Date.now();
    const template = TaskPlan.instantiate({
      id: params.id ?? TaskPlanId.generate(),
      identityId: params.identityId,
      title,
      description: params.description ?? null,
      taskType: TaskType.OneTime,
      importance: params.importance ?? ImportanceLevel.Moderate,
      status: TaskPlanStatus.Active,
      outcome: TaskPlanOutcome.Open,
      completionPolicy: TaskPlanCompletionPolicy.AllowCorrection,
      closedAt: null,
      archivedAt: null,
      abandonedReason: null,
      goalBinding: null,
      checklist: [],
      timeConfig: null,
      recurrenceRule: null,
      reminderConfig: null,
      lastGeneratedDate: null,
      generateAheadDays: null,
      startDate: params.startDate ?? null,
      dueDate: params.dueDate ?? null,
      completedAt: null,
      estimatedMinutes: params.estimatedMinutes ?? null,
      actualMinutes: null,
      note: params.note ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });

    template.addHistory('created', { taskType: TaskType.OneTime });
    return template;
  }

  public static createRecurringTask(params: {
    identityId: IdentityId;
    title: string;
    description?: string;
    timeConfig: TaskTimeConfig;
    recurrenceRule: RecurrenceRule;
    reminderConfig?: TaskReminderConfig;
    importance?: ImportanceLevel;
    generateAheadDays?: number;
  }): TaskPlan {
    TaskPlan.assertIdentityId(params.identityId, 'createRecurringTask');
    const title = TaskPlan.normalizeTitle(params.title, 'createRecurringTask');
    if (params.timeConfig.startDate == null) {
      throw new InvalidTaskPlanStateError('Recurring Task requires a date', {
        templateId: '',
        currentStatus: 'N/A',
        attemptedAction: 'createRecurringTask',
      });
    }

    const now = Date.now();
    const template = TaskPlan.instantiate({
      id: TaskPlanId.generate(),
      identityId: params.identityId,
      title,
      description: params.description ?? null,
      taskType: TaskType.Recurring,
      importance: params.importance ?? ImportanceLevel.Moderate,
      status: TaskPlanStatus.Active,
      outcome: TaskPlanOutcome.Open,
      completionPolicy: TaskPlanCompletionPolicy.AllowCorrection,
      closedAt: null,
      archivedAt: null,
      abandonedReason: null,
      goalBinding: null,
      checklist: [],
      timeConfig: params.timeConfig,
      recurrenceRule: params.recurrenceRule,
      reminderConfig: params.reminderConfig ?? null,
      lastGeneratedDate: null,
      generateAheadDays: params.generateAheadDays ?? 30,
      startDate: null,
      dueDate: null,
      completedAt: null,
      estimatedMinutes: null,
      actualMinutes: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });

    template.addHistory('created', { taskType: TaskType.Recurring });
    return template;
  }

  public static create(params: {
    id?: TaskPlanId;
    identityId: IdentityId;
    title: string;
    description?: string;
    taskType: TaskType;
    timeConfig: TaskTimeConfig;
    recurrenceRule?: RecurrenceRule;
    reminderConfig?: TaskReminderConfig;
    importance?: ImportanceLevel;
    generateAheadDays?: number;
    goalBinding?: {
      goalId: string;
      keyResultId?: string | null;
      contribution?: GoalContributionRule | null;
    } | null;
    completionPolicy?: (typeof TaskPlanCompletionPolicy)[keyof typeof TaskPlanCompletionPolicy];
  }): TaskPlan {
    TaskPlan.assertIdentityId(params.identityId, 'create');
    const title = TaskPlan.normalizeTitle(params.title, 'create');

    if (!params.timeConfig) {
      throw new InvalidTaskPlanStateError('Time configuration is required', {
        templateId: '',
        currentStatus: 'N/A',
        attemptedAction: 'create',
      });
    }

    if (params.taskType === TaskType.Recurring && !params.recurrenceRule) {
      throw new InvalidTaskPlanStateError('Recurrence rule is required for Recurring tasks', {
        templateId: '',
        currentStatus: 'N/A',
        attemptedAction: 'create',
      });
    }
    if (params.taskType === TaskType.Recurring && params.timeConfig.startDate == null) {
      throw new InvalidTaskPlanStateError('Recurring Task requires a date', {
        templateId: '',
        currentStatus: 'N/A',
        attemptedAction: 'create',
      });
    }

    const now = Date.now();
    const template = TaskPlan.instantiate({
      id: params.id ?? TaskPlanId.generate(),
      identityId: params.identityId,
      title,
      description: params.description ?? null,
      taskType: params.taskType,
      importance: params.importance ?? ImportanceLevel.Moderate,
      status: TaskPlanStatus.Active,
      outcome: TaskPlanOutcome.Open,
      completionPolicy: params.completionPolicy ?? TaskPlanCompletionPolicy.AllowCorrection,
      closedAt: null,
      archivedAt: null,
      abandonedReason: null,
      goalBinding: params.goalBinding
        ? TaskGoalBinding.create({
            goalId: params.goalBinding.goalId as TaskGoalBinding['goalId'],
            keyResultId: (params.goalBinding.keyResultId ?? null) as TaskGoalBinding['keyResultId'],
            contribution: params.goalBinding.contribution ?? null,
          })
        : null,
      checklist: [],
      timeConfig: params.timeConfig,
      recurrenceRule: params.recurrenceRule ?? null,
      reminderConfig: params.reminderConfig ?? null,
      lastGeneratedDate: null,
      generateAheadDays: params.generateAheadDays ?? 30,
      startDate: null,
      dueDate: null,
      completedAt: null,
      estimatedMinutes: null,
      actualMinutes: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });

    template.addHistory('created');
    template.publishDomainEvent<TaskEventMap['task:created']>('task:created', {
      identityId: params.identityId,
      task: template.toServerDTO(),
      templateId: template.id,
      goalId: template.goalBinding?.goalId ?? null,
    });

    return template;
  }

  public static load(state: TaskPlanState): TaskPlan {
    return TaskPlan.instantiate(state);
  }

  static startOfLocalDay(value: number): number {
    return taskTime.calendar.startOfDay(value);
  }
}
