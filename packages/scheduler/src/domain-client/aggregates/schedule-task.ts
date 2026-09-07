/**
 * ScheduleTask Aggregate Root - Domain Client
 * 调度任务聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with props object
 * - Public getters via this._props.xxx
 * - Static load(state: ScheduleTaskState): ScheduleTask
 * - Instance toDTO(): ScheduleTaskClientDTO
 */

import type {
  ScheduleTaskClientDTO,
  ScheduleConfigDTO,
  ExecutionInfoDTO,
  RetryPolicyDTO,
  TaskMetadataDTO,
  ScheduleTaskStatus,
  SourceModule,
  Timezone,
  TaskPriority,
  ExecutionStatus,
} from '@memoflow/contracts/schedule';
import { AggregateRoot } from '@memoflow/utils/domain';
import { ScheduleTaskId } from '../../server/domain/value-objects/schedule-task-id';
import { IdentityId } from '@memoflow/domain-shared';
import { ScheduleExecution } from '../entities/schedule-execution.js';

// ============ Value Object Wrappers ============

/**
 * ScheduleConfig 值对象包装
 */
export class ScheduleConfigVO {
  constructor(private readonly dto: ScheduleConfigDTO) {}

  get cronExpression(): string | null {
    return this.dto.cronExpression;
  }

  get timezone(): Timezone {
    return this.dto.timezone;
  }

  get startDate(): Date | null {
    return this.dto.startDate ? new Date(this.dto.startDate) : null;
  }

  get endDate(): Date | null {
    return this.dto.endDate ? new Date(this.dto.endDate) : null;
  }

  get maxExecutions(): number | null {
    return this.dto.maxExecutions;
  }

  toDTO(): ScheduleConfigDTO {
    return { ...this.dto };
  }
}

/**
 * ExecutionInfo 值对象包装
 */
export class ExecutionInfoVO {
  constructor(private readonly dto: ExecutionInfoDTO) {}

  get nextRunAt(): Date | null {
    return this.dto.nextRunAt ? new Date(this.dto.nextRunAt) : null;
  }

  get lastRunAt(): Date | null {
    return this.dto.lastRunAt ? new Date(this.dto.lastRunAt) : null;
  }

  get executionCount(): number {
    return this.dto.executionCount;
  }

  get lastExecutionStatus(): ExecutionStatus | null {
    return this.dto.lastExecutionStatus;
  }

  get consecutiveFailures(): number {
    return this.dto.consecutiveFailures;
  }

  toDTO(): ExecutionInfoDTO {
    return { ...this.dto };
  }
}

/**
 * RetryPolicy 值对象包装
 */
export class RetryPolicyVO {
  constructor(private readonly dto: RetryPolicyDTO) {}

  get enabled(): boolean {
    return this.dto.enabled;
  }

  get maxRetries(): number {
    return this.dto.maxRetries;
  }

  get retryDelay(): number {
    return this.dto.retryDelay;
  }

  get backoffMultiplier(): number {
    return this.dto.backoffMultiplier;
  }

  get maxRetryDelay(): number {
    return this.dto.maxRetryDelay;
  }

  toDTO(): RetryPolicyDTO {
    return { ...this.dto };
  }
}

/**
 * TaskMetadata 值对象包装
 */
export class TaskMetadataVO {
  constructor(private readonly dto: TaskMetadataDTO) {}

  get payload(): Record<string, unknown> {
    return { ...this.dto.payload };
  }

  get tags(): string[] {
    return [...this.dto.tags];
  }

  get priority(): TaskPriority {
    return this.dto.priority;
  }

  get timeout(): number | null {
    return this.dto.timeout;
  }

  toDTO(): TaskMetadataDTO {
    return { ...this.dto };
  }
}

// ============ Aggregate Root ============

// 内部状态接口
export interface ScheduleTaskState {
  id: ScheduleTaskId;
  identityId: IdentityId;
  name: string;
  description: string | null;
  sourceModule: SourceModule;
  sourceEntityId: string;
  status: ScheduleTaskStatus;
  enabled: boolean;
  schedule: ScheduleConfigVO;
  execution: ExecutionInfoVO;
  retryPolicy: RetryPolicyVO;
  metadata: TaskMetadataVO;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  executions: ScheduleExecution[] | null;
}

export class ScheduleTask extends AggregateRoot<ScheduleTaskId> {
  private readonly _props: ScheduleTaskState;

  private constructor(props: ScheduleTaskState) {
    super(props.id);
    this._props = props;
  }

  // ================= Getters =================
  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get name(): string {
    return this._props.name;
  }

  get description(): string | null {
    return this._props.description;
  }

  get sourceModule(): SourceModule {
    return this._props.sourceModule;
  }

  get sourceEntityId(): string {
    return this._props.sourceEntityId;
  }

  get status(): ScheduleTaskStatus {
    return this._props.status;
  }

  get enabled(): boolean {
    return this._props.enabled;
  }

  // 值对象
  get schedule(): ScheduleConfigVO {
    return this._props.schedule;
  }

  get execution(): ExecutionInfoVO {
    return this._props.execution;
  }

  get retryPolicy(): RetryPolicyVO {
    return this._props.retryPolicy;
  }

  get metadata(): TaskMetadataVO {
    return this._props.metadata;
  }

  // 同步字段
  get version(): number {
    return this._props.version;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this._props.deletedAt;
  }

  // 子实体
  get executions(): ScheduleExecution[] | null {
    return this._props.executions ? [...this._props.executions] : null;
  }

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  get isActive(): boolean {
    return this._props.status === 'Active' && this._props.enabled;
  }

  get isPaused(): boolean {
    return this._props.status === 'Paused';
  }

  get isCompleted(): boolean {
    return this._props.status === 'Completed';
  }

  get isCancelled(): boolean {
    return this._props.status === 'Cancelled';
  }

  get isFailed(): boolean {
    return this._props.status === 'Failed';
  }

  // ================= Factory Methods =================
  public static load(state: ScheduleTaskState): ScheduleTask {
    return new ScheduleTask(state);
  }

  // ================= DTO Conversion =================
  public toDTO(): ScheduleTaskClientDTO {
    return {
      id: String(this._props.id) as ScheduleTaskClientDTO['id'],
      identityId: String(this._props.identityId) as ScheduleTaskClientDTO['identityId'],
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
      executions: this._props.executions ? this._props.executions.map((e) => e.toDTO()) : null,
    };
  }
}
