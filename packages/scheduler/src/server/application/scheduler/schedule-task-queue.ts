/**
 * ScheduleTaskQueue - 优先队列调度器
 *
 * 核心思想：
 * 1. 维护一个按 nextRunAt 排序的优先队列（最小堆）
 * 2. 只设置一个 setTimeout 指向最近的任务
 * 3. 任务执行后，计算下次执行时间并重新入队
 *
 * 优势：
 * - 精度：毫秒级
 * - 资源：只有一个活跃的 timer
 * - 内存：O(n) 存储任务引用
 *
 * @module server/application/schedule/scheduler
 */

import { MinHeap } from '@memoflow/patterns/scheduler';
import type { HeapItem } from '@memoflow/patterns/scheduler';
import type { IScheduleTimer } from '@memoflow/patterns/scheduler';
import { NodeTimer } from '@memoflow/patterns/scheduler';
import type { IScheduleMonitor } from '@memoflow/patterns/scheduler';
import { NoopScheduleMonitor } from '@memoflow/patterns/scheduler';

/**
 * 调度队列中的任务项
 */
export interface ScheduledItem extends HeapItem {
  /** 任务名称（用于日志） */
  taskName: string;
  /** 任务归属身份（reload / execute 时走 identity 读路径） */
  identityId: string;
  /** cron 表达式（循环任务必需） */
  cronExpression: string | null;
  /** 时区 */
  timezone?: string;
  /** 任务元数据（可选） */
  metadata?: Record<string, unknown>;
}

/**
 * Logger 接口
 */
export interface IScheduleLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * 控制台 Logger 实现
 */
export class ConsoleScheduleLogger implements IScheduleLogger {
  private prefix = '[ScheduleTaskQueue]';

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`${this.prefix} ${message}`, meta ?? '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`${this.prefix} ${message}`, meta ?? '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`${this.prefix} ${message}`, meta ?? '');
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`${this.prefix} ${message}`, meta ?? '');
  }
}

/**
 * 任务加载器接口
 */
export interface IScheduleTaskLoader {
  /**
   * 加载所有活跃任务
   * @returns 活跃任务列表
   */
  loadActiveTasks(): Promise<ScheduledItem[]>;
}

/**
 * ScheduleTaskQueue 配置
 */
export interface ScheduleTaskQueueConfig {
  /** Timer 实现（默认 NodeTimer） */
  timer?: IScheduleTimer;
  /** 任务加载器（可选，用于启动时加载任务） */
  taskLoader?: IScheduleTaskLoader;
  /** Logger 实现（默认 ConsoleScheduleLogger） */
  logger?: IScheduleLogger;
  /** 监控实现（默认 NoopScheduleMonitor） */
  monitor?: IScheduleMonitor;
  /** 执行任务的回调 */
  onExecuteTask: (taskId: string, item: ScheduledItem) => Promise<void>;
  /** 执行错误回调（可选） */
  onExecuteError?: (taskId: string, error: Error) => void;
  /** 最大 timer 延迟（毫秒，默认 24 小时，超过此值会分段设置） */
  maxTimerDelay?: number;
}

/**
 * 队列状态
 */
export interface ScheduleTaskQueueStatus {
  /** 是否正在运行 */
  isRunning: boolean;
  /** 队列中的任务数量 */
  queueSize: number;
  /** 下一个任务的执行时间 */
  nextTaskAt: Date | null;
  /** 下一个任务的 UUID */
  nextTaskId: string | null;
}

/**
 * 错过任务检查结果
 */
export interface MissedTasksResult {
  /** 执行的任务数量 */
  executed: number;
  /** 失败的任务数量 */
  failed: number;
}

/**
 * ScheduleTaskQueue - 优先队列调度器
 */
export class ScheduleTaskQueue {
  private queue: MinHeap<ScheduledItem>;
  private currentTimer: unknown = null;
  private isRunning = false;
  private isExecuting = false;

  private readonly timer: IScheduleTimer;
  private readonly taskLoader?: IScheduleTaskLoader;
  private readonly logger: IScheduleLogger;
  private readonly monitor: IScheduleMonitor;
  private readonly onExecuteTask: (
    taskId: string,
    item: ScheduledItem
  ) => Promise<void>;
  private readonly onExecuteError?: (taskId: string, error: Error) => void;
  private readonly maxTimerDelay: number;

  // 24 小时（毫秒）- setTimeout 的最大安全延迟
  private static readonly DEFAULT_MAX_TIMER_DELAY = 24 * 60 * 60 * 1000;

  constructor(config: ScheduleTaskQueueConfig) {
    this.queue = new MinHeap<ScheduledItem>();
    this.timer = config.timer ?? new NodeTimer();
    this.taskLoader = config.taskLoader;
    this.logger = config.logger ?? new ConsoleScheduleLogger();
    this.monitor = config.monitor ?? new NoopScheduleMonitor();
    this.onExecuteTask = config.onExecuteTask;
    this.onExecuteError = config.onExecuteError;
    this.maxTimerDelay =
      config.maxTimerDelay ?? ScheduleTaskQueue.DEFAULT_MAX_TIMER_DELAY;
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('ScheduleTaskQueue already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('ScheduleTaskQueue starting...');

    try {
      // 从加载器加载所有活跃任务
      if (this.taskLoader) {
        await this.loadActiveTasks();
      }

      // 调度下一个任务
      this.scheduleNext();

      this.logger.info('ScheduleTaskQueue started', {
        queueSize: this.queue.size,
      });
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.currentTimer) {
      this.timer.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.isRunning = false;
    this.logger.info('ScheduleTaskQueue stopped');
  }

  /**
   * 排空（R1-3）：停止调度新任务，并等待当前正在执行的 handler 完成。
   * 供宿主 stop() 在关闭前调用，避免 runtime 停止时中断进行中的投递。
   */
  async drain(): Promise<void> {
    this.isRunning = false;
    while (this.isExecuting) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.logger.info('ScheduleTaskQueue drained');
  }

  /**
   * 添加任务到队列
   * @param item 任务项
   */
  addTask(item: ScheduledItem): void {
    if (!item.nextRunAt || item.nextRunAt <= 0) {
      this.logger.warn('Task has no valid nextRunAt, skipping', {
        taskId: item.taskId,
        taskName: item.taskName,
      });
      return;
    }

    // 如果任务已存在，先移除
    if (this.queue.has(item.taskId)) {
      this.queue.remove(item.taskId);
    }

    this.queue.insert(item);
    this.logger.debug('Task added to queue', {
      taskId: item.taskId,
      taskName: item.taskName,
      nextRunAt: new Date(item.nextRunAt).toISOString(),
    });

    // 如果正在运行，重新调度（新任务可能更早）
    if (this.isRunning) {
      this.reschedule();
    }
  }

  /**
   * 从队列中移除任务
   * @param taskId 任务 ID
   * @returns 是否成功移除
   */
  removeTask(taskId: string): boolean {
    const removed = this.queue.remove(taskId);
    if (removed) {
      this.logger.debug('Task removed from queue', { taskId });
      if (this.isRunning) {
        this.reschedule();
      }
    }
    return removed;
  }

  /**
   * 更新任务的执行时间
   * @param taskId 任务 ID
   * @param newNextRunAt 新的执行时间（毫秒时间戳）
   * @returns 是否成功更新
   */
  updateTaskSchedule(taskId: string, newNextRunAt: number): boolean {
    const updated = this.queue.update(taskId, newNextRunAt);
    if (updated) {
      this.logger.debug('Task schedule updated', {
        taskId,
        newNextRunAt: new Date(newNextRunAt).toISOString(),
      });
      if (this.isRunning) {
        this.reschedule();
      }
    }
    return updated;
  }

  /**
   * 暂停任务（从队列移除但不删除数据）
   * @param taskId 任务 ID
   * @returns 是否成功暂停
   */
  pauseTask(taskId: string): boolean {
    return this.removeTask(taskId);
  }

  /**
   * 恢复任务（需要提供任务信息重新加入队列）
   * @param item 任务项
   */
  resumeTask(item: ScheduledItem): void {
    this.addTask(item);
  }

  /**
   * 检查并执行所有错过的任务（用于系统休眠恢复）
   * @returns 执行结果
   */
  async checkMissedTasks(): Promise<MissedTasksResult> {
    const now = this.timer.now();
    const results: MissedTasksResult = { executed: 0, failed: 0 };

    this.logger.info('Checking for missed tasks...', {
      currentTime: new Date(now).toISOString(),
    });

    while (this.queue.size > 0) {
      const next = this.queue.peek();
      if (!next || next.nextRunAt > now) break;

      // 取出并执行
      const item = this.queue.extractMin()!;
      try {
        await this.executeTask(item);
        results.executed++;
      } catch (error) {
        results.failed++;
        this.logger.error('Missed task execution failed', {
          taskId: item.taskId,
          taskName: item.taskName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Missed tasks check completed', { ...results });

    // 重新调度
    if (this.isRunning) {
      this.reschedule();
    }

    return results;
  }

  /**
   * 获取队列状态
   */
  getStatus(): ScheduleTaskQueueStatus {
    const next = this.queue.peek();
    return {
      isRunning: this.isRunning,
      queueSize: this.queue.size,
      nextTaskAt: next ? new Date(next.nextRunAt) : null,
      nextTaskId: next?.taskId ?? null,
    };
  }

  /**
   * 获取所有队列中的任务（用于调试/持久化）
   */
  getQueuedTasks(): ScheduledItem[] {
    return this.queue.toArray();
  }

  /**
   * 检查任务是否在队列中
   * @param taskId 任务 ID
   */
  hasTask(taskId: string): boolean {
    return this.queue.has(taskId);
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.clear();
    if (this.currentTimer) {
      this.timer.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.logger.info('Queue cleared');
  }

  // ===== Private Methods =====

  /**
   * 从加载器加载活跃任务
   */
  private async loadActiveTasks(): Promise<void> {
    if (!this.taskLoader) return;

    try {
      const tasks = await this.taskLoader.loadActiveTasks();

      for (const task of tasks) {
        if (!task.nextRunAt || task.nextRunAt <= 0) continue;
        this.queue.insert(task);
      }

      this.logger.info('Loaded active tasks into queue', {
        count: tasks.length,
        queueSize: this.queue.size,
      });
    } catch (error) {
      this.logger.error('Failed to load active tasks', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 调度下一个任务
   */
  private scheduleNext(): void {
    if (!this.isRunning) return;

    // 清除现有 timer
    if (this.currentTimer) {
      this.timer.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    const next = this.queue.peek();
    if (!next) {
      this.logger.debug('Queue is empty, waiting for new tasks');
      return;
    }

    const now = this.timer.now();
    let delay = Math.max(0, next.nextRunAt - now);

    // 如果延迟超过最大值，分段设置
    if (delay > this.maxTimerDelay) {
      delay = this.maxTimerDelay;
      this.logger.debug('Delay exceeds max, setting intermediate timer', {
        taskId: next.taskId,
        taskName: next.taskName,
        scheduledAt: new Date(next.nextRunAt).toISOString(),
        intermediateDelayMs: delay,
      });
    } else {
      this.logger.debug('Scheduling next task', {
        taskId: next.taskId,
        taskName: next.taskName,
        scheduledAt: new Date(next.nextRunAt).toISOString(),
        delayMs: delay,
      });
    }

    this.currentTimer = this.timer.setTimeout(async () => {
      // 检查是否是中间定时器
      const nextItem = this.queue.peek();
      if (nextItem && nextItem.nextRunAt > this.timer.now()) {
        // 还没到执行时间，继续调度
        this.scheduleNext();
        return;
      }

      await this.executeNextTask();
    }, delay);
  }

  /**
   * 重新调度（当队列变化时）
   */
  private reschedule(): void {
    if (!this.isRunning || this.isExecuting) return;
    this.scheduleNext();
  }

  /**
   * 执行下一个任务
   */
  private async executeNextTask(): Promise<void> {
    const item = this.queue.extractMin();
    if (!item) {
      this.scheduleNext();
      return;
    }

    try {
      await this.executeTask(item);
    } catch (error) {
      this.logger.error('Task execution failed', {
        taskId: item.taskId,
        taskName: item.taskName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 继续调度下一个任务
    this.scheduleNext();
  }

  /**
   * 执行单个任务
   */
  private async executeTask(item: ScheduledItem): Promise<void> {
    const { taskId, taskName } = item;
    const startTime = this.timer.now();

    this.isExecuting = true;
    this.monitor.recordExecutionStart(taskId, taskName);

    try {
      // 调用执行回调
      await this.onExecuteTask(taskId, item);

      const duration = this.timer.now() - startTime;
      this.monitor.recordExecutionSuccess(taskId, taskName, duration);

      this.logger.info('Task executed successfully', {
        taskId,
        taskName,
        duration,
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.monitor.recordExecutionFailure(taskId, taskName, err);
      this.onExecuteError?.(taskId, err);
      throw error;
    } finally {
      this.isExecuting = false;
    }
  }
}
