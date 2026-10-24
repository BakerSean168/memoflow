/**
 * @file CronSchedulerManager.ts
 * @description Cron 调度管理器，统一管理所有定时任务。
 * @date 2025-01-22
 */

import * as cron from 'node-cron';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('CronSchedulerManager');

/**
 * Cron Job 配置接口。
 */
export interface CronJobConfig {
  /** 任务名称（唯一标识） */
  name: string;
  /** Cron 表达式 */
  schedule: string;
  /** 任务执行函数 */
  task: () => Promise<void>;
  /** 是否启用，默认为 true */
  enabled?: boolean;
  /** 时区，默认为 'Asia/Shanghai' */
  timezone?: string;
}

/**
 * 内部 Job 存储结构。
 */
interface StoredJob {
  /** cron 任务实例 */
  task: cron.ScheduledTask;
  /** 原始配置 */
  config: CronJobConfig;
}

/**
 * 任务状态接口。
 */
interface CronJobStatus {
  name: string;
  schedule: string;
  enabled: boolean;
  timezone?: string;
}

/**
 * Cron 调度管理器。
 *
 * @remarks
 * 负责应用中所有 Cron Jobs 的注册、启动、停止和状态监控。
 * 提供统一的错误处理和日志记录。
 * 实例由调用方创建并持有。
 */
export class CronSchedulerManager {
  private jobs: Map<string, StoredJob> = new Map();
  private isStarted: boolean = false;

  /**
   * 注册 Cron Job。
   *
   * @param config - 任务配置
   * @throws {Error} 当 Cron 表达式无效时抛出
   */
  register(config: CronJobConfig): void {
    if (this.jobs.has(config.name)) {
      logger.warn(`Cron job ${config.name} already registered, skipping`);
      return;
    }

    // 验证 cron 表达式
    if (!cron.validate(config.schedule)) {
      throw new Error(`Invalid cron expression: ${config.schedule}`);
    }

    logger.info('Registering cron job', {
      name: config.name,
      schedule: config.schedule,
      enabled: config.enabled ?? true,
      timezone: config.timezone,
    });

    // 创建包装任务(添加错误处理和日志)
    const wrappedTask = async () => {
      const startTime = Date.now();
      logger.info(`[${config.name}] Starting execution`);

      try {
        await config.task();
        const duration = Date.now() - startTime;
        logger.info(`[${config.name}] Completed successfully`, {
          duration: `${(duration / 1000).toFixed(2)}s`,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[${config.name}] Execution failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${(duration / 1000).toFixed(2)}s`,
        });
        // 不抛出错误,避免影响其他 Jobs
      }
    };

    // 创建 cron 任务(但不启动)
    const task = cron.schedule(config.schedule, wrappedTask, {
      timezone: config.timezone || 'Asia/Shanghai',
    });

    // 立即停止,等待统一启动
    task.stop();

    this.jobs.set(config.name, { task, config });

    logger.info(`Cron job ${config.name} registered successfully`);
  }

  /**
   * 启动所有已注册的 Jobs。
   */
  start(): void {
    if (this.isStarted) {
      logger.warn('Cron scheduler already started');
      return;
    }

    logger.info('Starting cron scheduler...');

    let startedCount = 0;
    let skippedCount = 0;

    for (const [name, { task, config }] of Array.from(this.jobs.entries())) {
      if (config.enabled !== false) {
        task.start();
        startedCount++;
        logger.info(`[${name}] Started (schedule: ${config.schedule})`);
      } else {
        skippedCount++;
        logger.info(`[${name}] Skipped (disabled)`);
      }
    }

    this.isStarted = true;

    logger.info('Cron scheduler started', {
      totalJobs: this.jobs.size,
      started: startedCount,
      skipped: skippedCount,
    });
  }

  /**
   * 停止所有 Jobs。
   */
  stop(): void {
    if (!this.isStarted) {
      logger.warn('Cron scheduler not started');
      return;
    }

    logger.info('Stopping cron scheduler...');

    let stoppedCount = 0;

    for (const [name, { task }] of Array.from(this.jobs.entries())) {
      task.stop();
      stoppedCount++;
      logger.info(`[${name}] Stopped`);
    }

    this.isStarted = false;

    logger.info('Cron scheduler stopped', {
      totalJobs: this.jobs.size,
      stopped: stoppedCount,
    });
  }

  /**
   * 启动指定的 Job。
   *
   * @param name - 任务名称
   * @throws {Error} 当任务未找到时抛出
   */
  startJob(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Cron job ${name} not found`);
    }

    job.task.start();
    logger.info(`[${name}] Started manually`);
  }

  /**
   * 停止指定的 Job。
   *
   * @param name - 任务名称
   * @throws {Error} 当任务未找到时抛出
   */
  stopJob(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Cron job ${name} not found`);
    }

    job.task.stop();
    logger.info(`[${name}] Stopped manually`);
  }

  /**
   * 手动触发指定的 Job。
   *
   * @remarks
   * 立即执行任务逻辑，不影响定时调度。
   *
   * @param name - 任务名称
   * @returns {Promise<void>}
   * @throws {Error} 当任务未找到时抛出
   */
  async triggerJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Cron job ${name} not found`);
    }

    logger.info(`[${name}] Triggering manually...`);
    await job.config.task();
  }

  /**
   * 获取所有任务的状态。
   *
   * @returns {CronJobStatus[]} 任务状态列表
   */
  public getStatus(): CronJobStatus[] {
    const status: CronJobStatus[] = [];
    for (const [name, { config }] of Array.from(this.jobs.entries())) {
      status.push({
        name,
        schedule: config.schedule,
        enabled: config.enabled !== false,
        timezone: config.timezone,
      });
    }
    return status;
  }

  /**
   * 注销指定的 Job。
   *
   * @param name - 任务名称
   */
  unregister(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      logger.warn(`Cron job ${name} not found, skipping unregister`);
      return;
    }

    job.task.stop();
    this.jobs.delete(name);
    logger.info(`[${name}] Unregistered`);
  }

  /**
   * 清空所有 Jobs。
   */
  clear(): void {
    this.stop();
    this.jobs.clear();
    logger.info('All cron jobs cleared');
  }
}
