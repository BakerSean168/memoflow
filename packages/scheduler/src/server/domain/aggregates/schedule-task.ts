/**
 * ScheduleTask Aggregate Root
 *
 * DDD aggregate root responsibilities:
 * - Manages task lifecycle
 * - Manages execution record child entities
 * - Executes business logic
 * - Ensures consistency within the aggregate
 */

import { AggregateRoot } from '@memoflow/utils/domain';
import { IdentityId } from '@memoflow/domain-shared';
import type {
  ScheduleEventMap,
  ScheduleTaskClientDTO,
  ScheduleTaskServerDTO,
  ScheduleConfigDTO,
  ExecutionInfoDTO,
  RetryPolicyDTO,
  TaskMetadataDTO,
  SourceModule,
} from '@memoflow/contracts/schedule';
import { ExecutionStatus, ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import {
  ExecutionInfo,
  RetryPolicy,
  ScheduleConfig,
  ScheduleTaskMetadata,
} from '../value-objects';
import { ScheduleTaskId } from '../value-objects/schedule-task-id';
import { ScheduleExecutionId } from '../value-objects/schedule-execution-id';
import { ScheduleExecution } from '../entities/schedule-execution';

/**
 * Domain state interface for the ScheduleTask aggregate
 */
export interface ScheduleTaskState {
  id: ScheduleTaskId;
  identityId: IdentityId;
  name: string;
  description: string | null;
  sourceModule: SourceModule;
  sourceEntityId: string;
  status: ScheduleTaskStatus;
  enabled: boolean;
  schedule: ScheduleConfig;
  execution: ExecutionInfo;
  retryPolicy: RetryPolicy;
  metadata: ScheduleTaskMetadata;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  deletedAt: Date | null;
}

/** ScheduleTask aggregate root. */
export class ScheduleTask extends AggregateRoot<ScheduleTaskId> {
  // ===== Private Fields =====
  private _props: ScheduleTaskState;

  // ===== Child Entity Collection =====
  private _executions: ScheduleExecution[];

  // ===== Constructor (Private) =====
  private constructor(state: ScheduleTaskState) {
    super(state.id);
    this._props = state;
    this._executions = [];
  }

  // ===== Getter Properties =====

  public get identityId(): IdentityId {
    return this._props.identityId;
  }
  public get name(): string {
    return this._props.name;
  }
  public get description(): string | null {
    return this._props.description;
  }
  public get sourceModule(): SourceModule {
    return this._props.sourceModule;
  }
  public get sourceEntityId(): string {
    return this._props.sourceEntityId;
  }
  public get status(): ScheduleTaskStatus {
    return this._props.status;
  }
  public get enabled(): boolean {
    return this._props.enabled;
  }
  public get schedule(): ScheduleConfig {
    return this._props.schedule;
  }
  public get execution(): ExecutionInfo {
    return this._props.execution;
  }
  public get retryPolicy(): RetryPolicy {
    return this._props.retryPolicy;
  }
  public get metadata(): ScheduleTaskMetadata {
    return this._props.metadata;
  }
  public get createdAt(): Date {
    return this._props.createdAt;
  }
  public get updatedAt(): Date {
    return this._props.updatedAt;
  }
  public get version(): number {
    return this._props.version;
  }
  public get deletedAt(): Date | null {
    return this._props.deletedAt;
  }
  public get executions(): ScheduleExecution[] | null {
    return this._executions.length > 0 ? [...this._executions] : null;
  }

  // ===== Convenience Accessor Methods =====

  /** Returns the task name (convenience accessor). */
  public get taskName(): string {
    return this._props.name;
  }

  /**
   * Returns the next execution time (convenience accessor).
   * @returns Date object or null
   */
  public get nextRunAt(): Date | null {
    return this._props.execution.nextRunAt ? new Date(this._props.execution.nextRunAt) : null;
  }

  /** Returns the execution count (convenience accessor). */
  public get executionCount(): number {
    return this._props.execution.executionCount;
  }

  /** Returns the maximum execution count (convenience accessor). */
  public get maxExecutions(): number | null {
    return this._props.schedule.maxExecutions;
  }

  /** Returns the execution info value object. */
  public getExecutionInfo(): ExecutionInfo {
    return this._props.execution;
  }

  /** Returns the schedule config value object. */
  public getScheduleConfig(): ScheduleConfig {
    return this._props.schedule;
  }

  /** Returns the retry policy value object. */
  public getRetryPolicyVO(): RetryPolicy {
    return this._props.retryPolicy;
  }

  /** Returns the task metadata value object. */
  public getTaskMetadata(): ScheduleTaskMetadata {
    return this._props.metadata;
  }

  // ===== Factory Methods (Child Entities) =====

  /** Creates an execution record. */
  public createExecution(params: {
    executionTime: number;
    status?: ExecutionStatus;
  }): ScheduleExecution {
    const execution = ScheduleExecution.create({
      taskId: this.id,
      executionTime: params.executionTime,
      status: params.status,
    });
    return execution;
  }

  // ===== Child Entity Management =====

  /** Adds an execution record. */
  public addExecution(execution: ScheduleExecution): void {
    this._executions.push(execution);
  }

  /** Finds an execution record by ID. */
  public getExecution(id: string): ScheduleExecution | null {
    return this._executions.find((e) => e.id === id) ?? null;
  }

  /** Returns all execution records. */
  public getAllExecutions(): ScheduleExecution[] {
    return [...this._executions];
  }

  /** Returns the most recent execution records up to the given limit. */
  public getRecentExecutions(limit: number): ScheduleExecution[] {
    return this._executions.sort((a, b) => b.executionTime - a.executionTime).slice(0, limit);
  }

  /** Returns all failed or timed-out execution records. */
  public getFailedExecutions(): ScheduleExecution[] {
    return this._executions.filter((e) => e.isFailed() || e.isTimeout());
  }

  // ===== Lifecycle Management =====

  /** Pauses the task. */
  public pause(reason?: string): void {
    if (
      this._props.status === ScheduleTaskStatus.Completed ||
      this._props.status === ScheduleTaskStatus.Cancelled
    ) {
      throw new Error('Cannot pause a completed or cancelled task');
    }
    this._props.status = ScheduleTaskStatus.Paused;
    // Auto-disable to maintain consistent state
    this._props.enabled = false;
    this._props.updatedAt = new Date();

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-paused']>('schedule:task-paused', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      reason,
    });
  }

  /** Resumes the task. */
  public resume(): void {
    if (this._props.status !== ScheduleTaskStatus.Paused) {
      throw new Error('Can only resume a paused task');
    }
    this._props.status = ScheduleTaskStatus.Active;
    // Auto-enable
    this._props.enabled = true;
    this._props.updatedAt = new Date();

    // Recalculate next execution time (uses current time as default)
    const nextRunAt = this._props.schedule.calculateNextRun(Date.now());
    this._props.execution = this._props.execution.with({ nextRunAt });

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-resumed']>('schedule:task-resumed', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      nextRunAt: nextRunAt ?? Date.now(),
    });
  }

  /** Completes the task. */
  public complete(): void {
    this._props.status = ScheduleTaskStatus.Completed;
    this._props.updatedAt = new Date();

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-completed']>('schedule:task-completed', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      totalExecutions: this._props.execution.executionCount,
    });
  }

  /** Cancels the task. */
  public cancel(reason: string): void {
    if (this._props.status === ScheduleTaskStatus.Completed) {
      throw new Error('Cannot cancel a completed task');
    }
    this._props.status = ScheduleTaskStatus.Cancelled;
    this._props.updatedAt = new Date();

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-cancelled']>('schedule:task-cancelled', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      reason,
    });
  }

  /** Marks the task as failed. */
  public fail(error: string): void {
    this._props.status = ScheduleTaskStatus.Failed;
    this._props.updatedAt = new Date();

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-failed']>('schedule:task-failed', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      error,
      consecutiveFailures: this._props.execution.consecutiveFailures,
    });
  }

  // ===== Schedule Configuration Management =====

  /** Updates the schedule configuration. */
  public updateSchedule(schedule: Partial<ScheduleConfigDTO>): void {
    const oldCron = this._props.schedule.cronExpression;
    this._props.schedule = this._props.schedule.with(schedule as Parameters<typeof this._props.schedule.with>[0]);
    this._props.updatedAt = new Date();

    const nextRunAt = this._props.schedule.calculateNextRun(Date.now());
    this._props.execution = this._props.execution.with({ nextRunAt });

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-schedule-updated']>('schedule:task-schedule-updated', {
      taskId: this.id,
      previousCronExpression: oldCron ?? '',
      newCronExpression: this._props.schedule.cronExpression ?? '',
      nextRunAt: nextRunAt ?? Date.now(),
    });
  }

  /** Updates the cron expression. */
  public updateCronExpression(cronExpression: string): void {
    this.updateSchedule({ cronExpression });
  }

  /**
   * Calculates the next run time.
   * @returns Timestamp in milliseconds
   */
  public calculateNextRun(): number | null {
    return this._props.schedule.calculateNextRun(Date.now());
  }

  // ===== Execution Info Management =====

  /**
   * Executes the task.
   *
   * @description
   * 1. Validates task is executable (status, enabled, due)
   * 2. Publishes schedule:task-triggered domain event
   * 3. Updates nextRunAt (result recorded externally via recordExecution)
   *
   * @returns Whether execution was successfully triggered
   */
  public execute(): boolean {
    // 1. Check if the task can execute
    if (!this.canExecute()) {
      return false;
    }

    // 2. Publish domain event (notify other modules that the task was triggered)
    // Fully serialize metadata DTO to ensure correct propagation
    const metadataDTO = this._props.metadata.toDTO();
    this.addDomainEvent<ScheduleEventMap['schedule:task-triggered']>('schedule:task-triggered', {
      taskId: this.id,
      taskName: this._props.name,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      executionTime: Date.now(),
      metadata: metadataDTO as unknown as Record<string, unknown>,
    });

    return true;
  }

  /** Checks whether the task can be executed. */
  public canExecute(): boolean {
    // Task must be active
    if (this._props.status !== ScheduleTaskStatus.Active) {
      return false;
    }

    // Task must be enabled
    if (!this._props.enabled) {
      return false;
    }

    // Check if due
    const now = Date.now();
    const nextRun = this._props.execution.nextRunAt;
    if (!nextRun || nextRun > now) {
      return false;
    }

    // Check if max executions reached
    const maxExecutions = this._props.schedule.maxExecutions;
    if (maxExecutions !== null && this._props.execution.executionCount >= maxExecutions) {
      return false;
    }

    return true;
  }

  /** Records an execution result. */
  public recordExecution(
    status: ExecutionStatus,
    duration: number,
    result?: Record<string, unknown>,
    error?: string,
    nextRunAt?: number | null,
  ): ScheduleExecution {
    const execution = this.createExecution({
      executionTime: Date.now(),
      status,
    });

    if (status === ExecutionStatus.Success) {
      execution.markSuccess(duration, result);
    } else if (status === ExecutionStatus.Failed) {
      execution.markFailed(error || 'Unknown error', duration);
    } else if (status === ExecutionStatus.Timeout) {
      execution.markTimeout(duration);
    } else if (status === ExecutionStatus.Skipped) {
      execution.markSkipped(error || 'Skipped');
    }

    this.addExecution(execution);

    // Update execution info
    this._props.execution = this._props.execution.updateAfterExecution({
      executedAt: Date.now(),
      status,
      duration,
      nextRunAt: nextRunAt ?? this._props.schedule.calculateNextRun(Date.now()),
    });

    this._props.updatedAt = new Date();

    // Publish event
    this.addDomainEvent<ScheduleEventMap['schedule:task-executed']>('schedule:task-executed', {
      taskId: this.id,
      executionId: execution.id as ScheduleExecutionId,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      status,
      duration,
      payload: this._props.metadata.toDTO().payload,
      identityId: this._props.identityId,
    });

    return execution;
  }

  /** Updates the execution info. */
  public updateExecutionInfo(updates: Partial<ExecutionInfoDTO>): void {
    this._props.execution = this._props.execution.with(updates as Parameters<typeof this._props.execution.with>[0]);
    this._props.updatedAt = new Date();
  }

  /** Resets the consecutive failure count. */
  public resetFailures(): void {
    this._props.execution = this._props.execution.resetFailures();
    this._props.updatedAt = new Date();
  }

  // ===== Retry Policy Management =====

  /** Updates the retry policy. */
  public updateRetryPolicy(policy: Partial<RetryPolicyDTO>): void {
    this._props.retryPolicy = this._props.retryPolicy.with(policy);
    this._props.updatedAt = new Date();
  }

  /** Determines whether the task should be retried. */
  public shouldRetry(): boolean {
    const execInfo = this._props.execution;
    return this._props.retryPolicy.shouldRetry(execInfo.consecutiveFailures);
  }

  /** Calculates the delay before the next retry. */
  public calculateNextRetryDelay(): number {
    const execInfo = this._props.execution;
    return this._props.retryPolicy.calculateNextRetryDelay(execInfo.consecutiveFailures);
  }

  // ===== Metadata & Description Management =====

  /** Updates the task description. */
  public updateDescription(description: string): void {
    this._props.description = description;
    this._props.updatedAt = new Date();
  }

  /** Updates the task metadata. */
  public updateMetadata(metadata: Partial<TaskMetadataDTO>): void {
    this._props.metadata = this._props.metadata.with(metadata);
    this._props.updatedAt = new Date();
  }

  /** Updates the payload. */
  public updatePayload(payload: Record<string, unknown>): void {
    this._props.metadata = this._props.metadata.setPayload(payload);
    this._props.updatedAt = new Date();
  }

  /** Adds a tag. */
  public addTag(tag: string): void {
    this._props.metadata = this._props.metadata.addTag(tag);
    this._props.updatedAt = new Date();
  }

  /** Removes a tag. */
  public removeTag(tag: string): void {
    this._props.metadata = this._props.metadata.removeTag(tag);
    this._props.updatedAt = new Date();
  }

  // ===== Enable/Disable =====

  /** Enables the task. */
  public enable(): void {
    const wasPaused = this._props.status === ScheduleTaskStatus.Paused;
    this._props.enabled = true;
    if (wasPaused) {
      this._props.status = ScheduleTaskStatus.Active;
      const nextRunAt = this._props.schedule.calculateNextRun(Date.now());
      this._props.execution = this._props.execution.with({ nextRunAt });
      this.addDomainEvent<ScheduleEventMap['schedule:task-resumed']>('schedule:task-resumed', {
        taskId: this.id,
        sourceModule: this._props.sourceModule,
        sourceEntityId: this._props.sourceEntityId,
        nextRunAt: nextRunAt ?? Date.now(),
      });
    }
    this._props.updatedAt = new Date();
  }

  /** Disables the task. */
  public disable(): void {
    const wasActive = this._props.status === ScheduleTaskStatus.Active;
    this._props.enabled = false;
    if (wasActive) {
      this._props.status = ScheduleTaskStatus.Paused;
      this.addDomainEvent<ScheduleEventMap['schedule:task-paused']>('schedule:task-paused', {
        taskId: this.id,
        sourceModule: this._props.sourceModule,
        sourceEntityId: this._props.sourceEntityId,
      });
    }
    this._props.updatedAt = new Date();
  }

  // ===== Status Checks =====

  public isActive(): boolean {
    return this._props.status === ScheduleTaskStatus.Active;
  }

  public isPaused(): boolean {
    return this._props.status === ScheduleTaskStatus.Paused;
  }

  public isCompleted(): boolean {
    return this._props.status === ScheduleTaskStatus.Completed;
  }

  public isCancelled(): boolean {
    return this._props.status === ScheduleTaskStatus.Cancelled;
  }

  public isFailed(): boolean {
    return this._props.status === ScheduleTaskStatus.Failed;
  }

  public isExpired(): boolean {
    return this._props.schedule.isExpired;
  }

  // ===== Conversion Methods =====

  /** Converts to a Server DTO. */
  public toServerDTO(includeChildren: boolean = false): ScheduleTaskServerDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.name,
      description: this._props.description,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      status: this._props.status,
      enabled: this._props.enabled,
      schedule: this._props.schedule.toDTO(),
      execution: this._props.execution.toDTO(),
      retryPolicy: this._props.retryPolicy.toDTO(),
      metadata: this._props.metadata.toDTO(),
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      version: this._props.version,
      deletedAt: this._props.deletedAt ? this._props.deletedAt.getTime() : null,
      executions: includeChildren ? this._executions.map((e) => e.toServerDTO()) : undefined,
    };
  }

  /** Converts to a Client DTO for frontend consumption. */
  public toClientDTO(includeChildren: boolean = false): ScheduleTaskClientDTO {
    return {
      id: this.id,
      identityId: this._props.identityId as ScheduleTaskClientDTO['identityId'],
      name: this._props.name,
      description: this._props.description,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      status: this._props.status,
      enabled: this._props.enabled,
      schedule: this._props.schedule.toDTO(),
      execution: this._props.execution.toDTO(),
      retryPolicy: this._props.retryPolicy.toDTO(),
      metadata: this._props.metadata.toDTO(),
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
      executions: includeChildren ? this._executions.map((e) => e.toClientDTO()) : null,
    };
  }

  // ===== Static Factory Methods =====

  /** Creates a new task. */
  public static create(params: {
    id?: string;
    identityId: string;
    name: string;
    sourceModule: SourceModule;
    sourceEntityId: string;
    schedule: ScheduleConfig | ScheduleConfigDTO;
    description?: string;
    metadata?: ScheduleTaskMetadata | TaskMetadataDTO;
    retryPolicy?: RetryPolicy | RetryPolicyDTO;
  }): ScheduleTask {
    const schedule =
      params.schedule instanceof ScheduleConfig
        ? params.schedule
        : ScheduleConfig.fromDTO(params.schedule);
    const metadata =
      params.metadata instanceof ScheduleTaskMetadata
        ? params.metadata
        : params.metadata
          ? ScheduleTaskMetadata.fromDTO(params.metadata)
          : ScheduleTaskMetadata.createDefault();
    const retryPolicy =
      params.retryPolicy instanceof RetryPolicy
        ? params.retryPolicy
        : params.retryPolicy
          ? RetryPolicy.fromDTO(params.retryPolicy)
          : RetryPolicy.createDefault();
    const now = new Date();
    const nextRunAt = schedule.calculateNextRun(now.getTime());

    const state: ScheduleTaskState = {
      id: params.id ? ScheduleTaskId.of(params.id) : ScheduleTaskId.generate(),
      identityId: params.identityId as IdentityId,
      name: params.name,
      description: params.description ?? null,
      sourceModule: params.sourceModule,
      sourceEntityId: params.sourceEntityId,
      status: ScheduleTaskStatus.Active,
      enabled: true,
      schedule,
      execution: ExecutionInfo.fromDTO({
        nextRunAt: nextRunAt !== null ? new Date(nextRunAt).toISOString() : null,
        lastRunAt: null,
        executionCount: 0,
        lastExecutionStatus: null,
        lastExecutionDuration: null,
        consecutiveFailures: 0,
      }),
      retryPolicy,
      metadata,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
    };

    const task = new ScheduleTask(state);

    // Publish creation event
    task.addDomainEvent<ScheduleEventMap['schedule:task-created']>('schedule:task-created', {
      taskId: task.id,
      name: params.name,
      sourceModule: params.sourceModule,
      sourceEntityId: params.sourceEntityId,
      cronExpression: schedule.toDTO().cronExpression ?? '',
      nextRunAt: nextRunAt ?? Date.now(),
    });

    return task;
  }

  /** Loads an aggregate root from existing state (for persistence reconstruction). */
  public static load(state: ScheduleTaskState): ScheduleTask {
    return new ScheduleTask(state);
  }

}
