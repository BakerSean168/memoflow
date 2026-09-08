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

export interface TaskPlanInstanceStats {
  templateId: string;
  instanceCount: number;
  completedInstanceCount: number;
  pendingInstanceCount: number;
  dueInstanceCount: number;
  completedDueInstanceCount: number;
  completionWindowDays: 30;
  futurePendingInstanceCount: number;
  singleInstanceStatus: TaskOccurrenceStatus | null;
  completionRate: number;
}

/**
 * TaskOccurrence 仓储接口
 */
export interface ITaskOccurrenceRepository {
  /**
   * 保存任务实例
   */
  save(instance: TaskOccurrence): Promise<void>;

  /**
   * 批量保存任务实例
   */
  saveMany(instances: TaskOccurrence[]): Promise<void>;

  /**
   * 根据 ID + identity 查找任务实例（唯一授权敏感读路径）
   */
  findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null>;

  /**
   * 根据模板 ID + identity 查找任务实例
   */
  findByTemplateId(templateId: string, identityId: string): Promise<TaskOccurrence[]>;

  /**
   * 根据用户 ID 查找任务实例
   */
  findByIdentityId(identityId: string): Promise<TaskOccurrence[]>;

  /**
   * 根据日期范围查找任务实例
   */
  findByDateRange(identityId: string, startDate: number, endDate: number): Promise<TaskOccurrence[]>;

  /**
   * 根据状态查找任务实例
   */
  findByStatus(identityId: string, status: TaskOccurrenceStatus): Promise<TaskOccurrence[]>;

  /**
   * 查找过期的任务实例
   */
  findOverdueInstances(identityId: string): Promise<TaskOccurrence[]>;

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
  deleteByTemplateId(templateId: string, identityId: string): Promise<void>;

  /**
   * 统计模板的未过期实例数量
   * @param templateId 模板 ID
   * @param fromDate 起始日期时间戳（默认为当前时间）
   */
  countFutureInstances(
    templateId: string,
    identityId: string,
    fromDate?: number,
  ): Promise<number>;

  /**
   * 根据模板 ID 和日期范围查找任务实例
   */
  findByTemplateIdAndDateRange(
    templateId: string,
    identityId: string,
    startDate: number,
    endDate: number,
  ): Promise<TaskOccurrence[]>;

  /**
   * 批量统计模板实例聚合数据
   */
  getTemplateStats(
    templateIds: string[],
    identityId: string,
    asOf?: number,
  ): Promise<Record<string, TaskPlanInstanceStats>>;

  /**
   * 删除模板从指定时点开始的未完成实例
   * 用于暂停模板时清理当前及未来无意义的实例
   */
  deleteIncompleteInstancesFrom(
    templateId: string,
    identityId: string,
    fromDate: number,
  ): Promise<number>;
}
