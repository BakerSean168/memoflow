/**
 * TaskOccurrence 仓储接口 (Server)
 * 任务实例聚合根仓储
 *
 * DDD 仓储职责：
 * - 聚合根的持久化
 * - 聚合根的查询
 * - 是基础设施层的抽象
 */

import type { TaskOccurrence } from '../aggregates';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';

export interface TaskPlanStatsWindow {
  /** Inclusive start of the Product Time calendar-date window. */
  windowStart: Ymd;
  /** Query instant; future/past classification is relative to this instant. */
  asOf: Ymd;
}

export interface TaskPlanOccurrenceStats {
  planId: string;
  occurrenceCount: number;
  completedOccurrenceCount: number;
  pendingOccurrenceCount: number;
  dueOccurrenceCount: number;
  completedDueOccurrenceCount: number;
  completionWindowDays: 30;
  futurePendingOccurrenceCount: number;
  singleOccurrenceStatus: TaskOccurrenceStatus | null;
  completionRate: number;
}

export interface TaskOccurrenceStatusCounts {
  total: number;
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
  inProgress: number;
}

/**
 * TaskOccurrence 仓储接口
 */
export interface ITaskOccurrenceRepository {
  /**
   * 保存任务实例
   */
  save(occurrence: TaskOccurrence): Promise<void>;

  /**
   * 批量保存任务实例
   */
  saveMany(occurrences: TaskOccurrence[]): Promise<void>;

  /**
   * 根据 ID + identity 查找任务实例（唯一授权敏感读路径）
   */
  findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null>;

  /**
   * 根据模板 ID + identity 查找任务实例
   */
  findByPlanId(planId: string, identityId: string): Promise<TaskOccurrence[]>;

  /**
   * 根据用户 ID 查找任务实例
   */
  findByIdentityId(identityId: string): Promise<TaskOccurrence[]>;

  /**
   * 根据日期范围查找任务实例
   */
  findByDateRange(identityId: string, startDate: Ymd, endDate: Ymd): Promise<TaskOccurrence[]>;

  /**
   * 根据状态查找任务实例
   */
  findByStatus(identityId: string, status: TaskOccurrenceStatus): Promise<TaskOccurrence[]>;

  /**
   * 查找过期的任务实例
   */
  findOverdueOccurrences(identityId: string): Promise<TaskOccurrence[]>;

  /**
   * 删除任务实例（identity-scoped）
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * 批量删除任务实例
   */
  deleteMany(identityId: string, ids: string[]): Promise<void>;

  /**
   * 删除模板的所有任务实例
   */
  deleteByPlanId(planId: string, identityId: string): Promise<void>;

  /**
   * 统计模板的未过期实例数量
   * @param planId 模板 ID
   * @param fromDate 起始日期时间戳（默认为当前时间）
   */
  countFutureOccurrences(planId: string, identityId: string, fromDate?: Ymd): Promise<number>;

  /**
   * 根据模板 ID 和日期范围查找任务实例
   */
  findByPlanIdAndDateRange(
    planId: string,
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]>;

  /**
   * 批量统计模板实例聚合数据
   */
  getPlanStats(
    planIds: string[],
    identityId: string,
    window: TaskPlanStatsWindow,
  ): Promise<Record<string, TaskPlanOccurrenceStats>>;

  getStatusCountsForPlan(
    planId: string,
    identityId: string,
  ): Promise<TaskOccurrenceStatusCounts>;

  findRecentByPlan(
    planId: string,
    identityId: string,
    limit: number,
  ): Promise<TaskOccurrence[]>;

  /**
   * 删除模板从指定时点开始的未完成实例
   * 用于暂停模板时清理当前及未来无意义的实例
   */
  deleteIncompleteOccurrencesFrom(
    planId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number>;
}
