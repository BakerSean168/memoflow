/**
 * ScheduleExecution 实体实现
 * 执行记录实体
 *
 * DDD 实体职责：
 * - 管理单次执行记录
 * - 执行状态追踪
 * - 错误信息管理
 */

import { Entity } from '@memoflow/utils/domain';
import { generateUUID } from '@memoflow/utils/shared';
import type {
  ScheduleExecutionClientDTO,
  ScheduleExecutionServerDTO,
} from '@memoflow/contracts/schedule';
import { ExecutionStatus } from '@memoflow/contracts/schedule';
import { ScheduleExecutionId } from '../value-objects/schedule-execution-id';
import { ScheduleTaskId } from '../value-objects/schedule-task-id';

/** Domain state interface for the ScheduleExecution entity */
export interface ScheduleExecutionState {
  id: string;
  taskId: string;
  identityId?: string;
  executionTime: Date;
  status: ExecutionStatus;
  duration: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  createdAt: Date;
}

/**
 * ScheduleExecution 实体
 */
export class ScheduleExecution extends Entity<string> {
  // ===== 私有字段 =====
  private _taskId: string;
  private _identityId: string | undefined;
  private _executionTime: Date;
  private _status: ExecutionStatus;
  private _duration: number | null;
  private _result: Record<string, unknown> | null;
  private _error: string | null;
  private _retryCount: number;
  private _createdAt: Date;

  // ===== 构造函数（私有） =====
  private constructor(state: ScheduleExecutionState) {
    super(state.id);
    this._taskId = state.taskId;
    this._identityId = state.identityId;
    this._executionTime = state.executionTime;
    this._status = state.status;
    this._duration = state.duration;
    this._result = state.result;
    this._error = state.error;
    this._retryCount = state.retryCount;
    this._createdAt = state.createdAt;
  }

  // ===== Getter 属性 =====

  public get taskId(): string {
    return this._taskId;
  }
  public get identityId(): string | undefined {
    return this._identityId;
  }
  public get executionTime(): number {
    return this._executionTime.getTime();
  }
  public get status(): ExecutionStatus {
    return this._status;
  }
  public get duration(): number | null {
    return this._duration;
  }
  public get result(): Record<string, unknown> | null {
    return this._result;
  }
  public get error(): string | null {
    return this._error;
  }
  public get retryCount(): number {
    return this._retryCount;
  }
  public get createdAt(): Date {
    return this._createdAt;
  }

  // ===== 业务方法 =====

  /**
   * 标记执行成功
   */
  public markSuccess(duration: number, result?: Record<string, unknown>): void {
    this._status = ExecutionStatus.Success;
    this._duration = duration;
    if (result) {
      this._result = result;
    }
    this._error = null;
  }

  /**
   * 标记执行失败
   */
  public markFailed(error: string, duration?: number): void {
    this._status = ExecutionStatus.Failed;
    this._error = error;
    if (duration !== undefined) {
      this._duration = duration;
    }
  }

  /**
   * 标记执行超时
   */
  public markTimeout(duration: number): void {
    this._status = ExecutionStatus.Timeout;
    this._duration = duration;
    this._error = 'Execution timeout';
  }

  /**
   * 标记执行跳过
   */
  public markSkipped(reason: string): void {
    this._status = ExecutionStatus.Skipped;
    this._error = reason;
    this._duration = 0;
  }

  /**
   * 增加重试次数
   */
  public incrementRetry(): void {
    this._retryCount += 1;
    this._status = ExecutionStatus.Retrying;
  }

  /**
   * 设置执行结果
   */
  public setResult(result: Record<string, unknown>): void {
    this._result = result;
  }

  /**
   * 设置错误信息
   */
  public setError(error: string): void {
    this._error = error;
  }

  /**
   * 检查是否成功
   */
  public isSuccess(): boolean {
    return this._status === ExecutionStatus.Success;
  }

  /**
   * 检查是否失败
   */
  public isFailed(): boolean {
    return this._status === ExecutionStatus.Failed;
  }

  /**
   * 检查是否超时
   */
  public isTimeout(): boolean {
    return this._status === ExecutionStatus.Timeout;
  }

  /**
   * 检查是否跳过
   */
  public isSkipped(): boolean {
    return this._status === ExecutionStatus.Skipped;
  }

  // ===== 转换方法 =====

  /**
   * 转换为 Server DTO
   */
  public toServerDTO(): ScheduleExecutionServerDTO {
    return {
      id: this.id as ScheduleExecutionId,
      taskId: this._taskId as ScheduleTaskId,
      executionTime: this._executionTime.getTime(),
      status: this._status,
      duration: this._duration,
      result: this._result ? { ...this._result } : null,
      error: this._error,
      retryCount: this._retryCount,
      createdAt: this._createdAt.getTime(),
    };
  }

  /**
   * 转换为 Client DTO
   */
  public toClientDTO(): ScheduleExecutionClientDTO {
    return {
      id: this.id as ScheduleExecutionClientDTO['id'],
      scheduleTaskId: this._taskId as ScheduleExecutionClientDTO['scheduleTaskId'],
      executionTime: this._executionTime.getTime(),
      status: this._status,
      duration: this._duration,
      result: this._result ? { ...this._result } : null,
      error: this._error,
      retryCount: this._retryCount,
      version: 1,
      createdAt: this._createdAt.getTime(),
      updatedAt: this._createdAt.getTime(),
      deletedAt: null,
    };
  }

  /**
   * 转换为 Server DTO 别名。
   */
  public toDTO(): ScheduleExecutionServerDTO {
    return this.toServerDTO();
  }

  // ===== 静态工厂方法 =====

  /**
   * 创建新的执行记录
   */
  public static create(params: {
    taskId: string;
    executionTime: number;
    status?: ExecutionStatus;
  }): ScheduleExecution {
    return new ScheduleExecution({
      id: generateUUID(),
      taskId: params.taskId,
      executionTime: new Date(params.executionTime),
      status: params.status ?? ExecutionStatus.Success,
      duration: null,
      result: null,
      error: null,
      retryCount: 0,
      createdAt: new Date(),
    });
  }

  /**
   * 从已有状态加载实体（用于持久化重建）
   */
  public static load(state: ScheduleExecutionState): ScheduleExecution {
    return new ScheduleExecution(state);
  }

}
