/**
 * ScheduleExecution Entity - Domain Client
 * 调度执行记录实体 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with props object
 * - Public getters via this._props.xxx
 * - Static load(state: ScheduleExecutionState): ScheduleExecution
 * - Instance toDTO(): ScheduleExecutionClientDTO
 */

import type { ScheduleExecutionClientDTO, ExecutionStatus } from '@memoflow/contracts/schedule';
import { Entity } from '@memoflow/utils/domain';
import { ScheduleExecutionId } from '../../server/domain/value-objects/schedule-execution-id';
import { ScheduleTaskId } from '../../server/domain/value-objects/schedule-task-id';

// 内部状态接口
export interface ScheduleExecutionState {
  id: ScheduleExecutionId;
  scheduleTaskId: ScheduleTaskId;
  executionTime: Date;
  status: ExecutionStatus;
  duration: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class ScheduleExecution extends Entity<ScheduleExecutionId> {
  private readonly _props: ScheduleExecutionState;

  private constructor(props: ScheduleExecutionState) {
    super(props.id);
    this._props = props;
  }

  // ================= Getters =================
  get scheduleTaskId(): ScheduleTaskId {
    return this._props.scheduleTaskId;
  }

  get executionTime(): Date {
    return this._props.executionTime;
  }

  get status(): ExecutionStatus {
    return this._props.status;
  }

  get duration(): number | null {
    return this._props.duration;
  }

  get result(): Record<string, unknown> | null {
    return this._props.result ? { ...this._props.result } : null;
  }

  get error(): string | null {
    return this._props.error;
  }

  get retryCount(): number {
    return this._props.retryCount;
  }

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

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  get isSuccess(): boolean {
    return this._props.status === 'Success';
  }

  get isFailed(): boolean {
    return this._props.status === 'Failed';
  }

  get isTimeout(): boolean {
    return this._props.status === 'Timeout';
  }

  get isSkipped(): boolean {
    return this._props.status === 'Skipped';
  }

  get isRetrying(): boolean {
    return this._props.status === 'Retrying';
  }

  // ================= Factory Methods =================
  public static load(state: ScheduleExecutionState): ScheduleExecution {
    return new ScheduleExecution(state);
  }

  // ================= DTO Conversion =================
  public toDTO(): ScheduleExecutionClientDTO {
    return {
      id: String(this._props.id) as ScheduleExecutionClientDTO['id'],
      scheduleTaskId: String(
        this._props.scheduleTaskId,
      ) as ScheduleExecutionClientDTO['scheduleTaskId'],
      executionTime: this._props.executionTime.getTime(),
      status: this._props.status,
      duration: this._props.duration,
      result: this._props.result ? { ...this._props.result } : null,
      error: this._props.error,
      retryCount: this._props.retryCount,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }
}
