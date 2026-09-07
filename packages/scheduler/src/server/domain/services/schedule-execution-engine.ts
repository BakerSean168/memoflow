/**
 * ScheduleExecutionEngine 领域服务
 * 
 * 职责：
 * - 定义调度执行引擎的接口
 * - 管理调度任务的生命周期（加载、启动、停止、添加、移除）
 * - 与 ScheduleTask 聚合根集成
 * 
 * 设计原则：
 * - 领域服务：协调多个聚合根
 * - 依赖倒置：定义接口，具体实现在基础设施层
 * - 单一职责：只负责调度引擎的抽象管理
 * 
 * 注意：具体的 Bree 集成实现在 apps/api/src/modules/schedule/infrastructure
 */

import { ScheduleTask } from '../aggregates/schedule-task';

/**
 * 任务执行上下文
 * 传递给 Worker 的数据
 */
export interface TaskExecutionContext {
  taskId: string;
  identityId: string;
  sourceModule: string;
  sourceEntityId: string;
  metadata: Record<string, unknown>;
  executedAt: number;
}

/**
 * 调度执行引擎接口
 * 
 * 领域层定义接口，基础设施层提供具体实现（如 BreeExecutionEngine）
 */
export interface IScheduleExecutionEngine {
  /**
   * 初始化并启动调度引擎
   * 
   * @param tasks 初始加载的调度任务列表
   */
  start(tasks: ScheduleTask[]): Promise<void>;

  /**
   * 停止调度引擎
   */
  stop(): Promise<void>;

  /**
   * 添加新的调度任务
   * 
   * @param task ScheduleTask 聚合根
   */
  addTask(task: ScheduleTask): Promise<void>;

  /**
   * 移除调度任务
   * 
   * @param taskId 任务 ID
   */
  removeTask(taskId: string): Promise<void>;

  /**
   * 暂停任务
   * 
   * @param taskId 任务 ID
   */
  pauseTask(taskId: string): Promise<void>;

  /**
   * 恢复任务
   * 
   * @param taskId 任务 ID
   */
  resumeTask(taskId: string): Promise<void>;

  /**
   * 立即执行任务（忽略调度时间）
   * 
   * @param taskId 任务 ID
   */
  runTask(taskId: string): Promise<void>;

  /**
   * 获取活跃任务列表
   */
  getActiveTasks(): ScheduleTask[];

  /**
   * 检查引擎是否运行中
   */
  isEngineRunning(): boolean;
}
