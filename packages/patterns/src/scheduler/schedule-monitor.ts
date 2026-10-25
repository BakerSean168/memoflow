/**
 * IScheduleMonitor - 调度监控接口
 *
 * 提供调度执行的可观测性，允许不同环境实现自己的监控策略
 *
 * @module patterns/scheduler
 */

// Residual 1039: sole schedule monitor lives in patterns; schedule dual file deleted.

/**
 * 执行统计数据
 */
export interface ScheduleExecutionStats {
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功执行次数 */
  successfulExecutions: number;
  /** 失败执行次数 */
  failedExecutions: number;
  /** 跳过执行次数 */
  skippedExecutions: number;
  /** 最后执行时间 */
  lastExecutionAt: Date | null;
  /** 平均执行时长（毫秒） */
  averageExecutionDuration: number;
}

/**
 * 执行记录
 */
export interface ScheduleExecutionRecord {
  taskId: string;
  taskName: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  status: 'started' | 'success' | 'failure' | 'skipped';
  error?: Error;
  reason?: string;
}

/**
 * 调度监控接口
 *
 * 实现此接口以收集调度执行的监控数据
 */
export interface IScheduleMonitor {
  /**
   * 记录任务执行开始
   * @param taskId 任务 ID
   * @param taskName 任务名称
   */
  recordExecutionStart(taskId: string, taskName: string): void;

  /**
   * 记录任务执行成功
   * @param taskId 任务 ID
   * @param taskName 任务名称
   * @param duration 执行时长（毫秒）
   */
  recordExecutionSuccess(taskId: string, taskName: string, duration?: number): void;

  /**
   * 记录任务执行失败
   * @param taskId 任务 ID
   * @param taskName 任务名称
   * @param error 错误信息
   */
  recordExecutionFailure(taskId: string, taskName: string, error: Error): void;

  /**
   * 记录任务执行跳过
   * @param taskId 任务 ID
   * @param taskName 任务名称
   * @param reason 跳过原因
   */
  recordExecutionSkipped(taskId: string, taskName: string, reason: string): void;

  /**
   * 获取执行统计
   */
  getStats(): ScheduleExecutionStats;

  /**
   * 获取最近的执行记录
   * @param limit 返回的记录数量限制
   */
  getRecentRecords?(limit?: number): ScheduleExecutionRecord[];

  /**
   * 重置统计数据
   */
  resetStats(): void;
}

/**
 * 空操作监控实现（用于禁用监控场景）
 */
export class NoopScheduleMonitor implements IScheduleMonitor {
  recordExecutionStart(): void {
    // no-op
  }

  recordExecutionSuccess(): void {
    // no-op
  }

  recordExecutionFailure(): void {
    // no-op
  }

  recordExecutionSkipped(): void {
    // no-op
  }

  getStats(): ScheduleExecutionStats {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      skippedExecutions: 0,
      lastExecutionAt: null,
      averageExecutionDuration: 0,
    };
  }

  resetStats(): void {
    // no-op
  }
}

/**
 * 内存监控实现（用于开发/测试）
 */
export class InMemoryScheduleMonitor implements IScheduleMonitor {
  private stats: ScheduleExecutionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    skippedExecutions: 0,
    lastExecutionAt: null,
    averageExecutionDuration: 0,
  };

  private records: ScheduleExecutionRecord[] = [];
  private pendingExecutions: Map<string, ScheduleExecutionRecord> = new Map();
  private totalDuration = 0;
  private readonly maxRecords: number;

  constructor(maxRecords = 100) {
    this.maxRecords = maxRecords;
  }

  recordExecutionStart(taskId: string, taskName: string): void {
    const record: ScheduleExecutionRecord = {
      taskId,
      taskName,
      startedAt: new Date(),
      status: 'started',
    };
    this.pendingExecutions.set(taskId, record);
  }

  recordExecutionSuccess(taskId: string, taskName: string, duration?: number): void {
    const pending = this.pendingExecutions.get(taskId);
    const now = new Date();

    const record: ScheduleExecutionRecord = pending
      ? {
          ...pending,
          completedAt: now,
          duration: duration ?? now.getTime() - pending.startedAt.getTime(),
          status: 'success',
        }
      : {
          taskId,
          taskName,
          startedAt: now,
          completedAt: now,
          duration: duration ?? 0,
          status: 'success',
        };

    this.addRecord(record);
    this.pendingExecutions.delete(taskId);

    this.stats.totalExecutions++;
    this.stats.successfulExecutions++;
    this.stats.lastExecutionAt = now;

    if (record.duration !== undefined) {
      this.totalDuration += record.duration;
      this.stats.averageExecutionDuration = this.totalDuration / this.stats.totalExecutions;
    }
  }

  recordExecutionFailure(taskId: string, taskName: string, error: Error): void {
    const pending = this.pendingExecutions.get(taskId);
    const now = new Date();

    const record: ScheduleExecutionRecord = pending
      ? {
          ...pending,
          completedAt: now,
          duration: now.getTime() - pending.startedAt.getTime(),
          status: 'failure',
          error,
        }
      : {
          taskId,
          taskName,
          startedAt: now,
          completedAt: now,
          status: 'failure',
          error,
        };

    this.addRecord(record);
    this.pendingExecutions.delete(taskId);

    this.stats.totalExecutions++;
    this.stats.failedExecutions++;
    this.stats.lastExecutionAt = now;
  }

  recordExecutionSkipped(taskId: string, taskName: string, reason: string): void {
    const now = new Date();

    const record: ScheduleExecutionRecord = {
      taskId,
      taskName,
      startedAt: now,
      status: 'skipped',
      reason,
    };

    this.addRecord(record);
    this.stats.skippedExecutions++;
  }

  getStats(): ScheduleExecutionStats {
    return { ...this.stats };
  }

  getRecentRecords(limit = 50): ScheduleExecutionRecord[] {
    return this.records.slice(-limit);
  }

  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      skippedExecutions: 0,
      lastExecutionAt: null,
      averageExecutionDuration: 0,
    };
    this.records = [];
    this.pendingExecutions.clear();
    this.totalDuration = 0;
  }

  private addRecord(record: ScheduleExecutionRecord): void {
    this.records.push(record);
    // 保持记录数量限制
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }
}
