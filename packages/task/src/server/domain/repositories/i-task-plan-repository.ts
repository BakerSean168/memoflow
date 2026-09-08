/**
 * TaskPlan 仓储接口 (Server)
 * 任务模板聚合根仓储
 *
 * DDD 仓储职责：
 * - 聚合根的持久化（保存、查询、删除）
 * - 提供丰富的查询接口
 * - 是基础设施层的抽象
 */

import type { TaskPlan } from '../aggregates';
import type { TaskPlanStatus } from '@memoflow/contracts/task';
import type { LabelClientDTO } from '@memoflow/contracts/label';

export class TaskLabelOwnershipError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;

  constructor() {
    super('One or more labels do not belong to the identity.');
    this.name = 'TaskLabelOwnershipError';
  }
}

/**
 * 任务查询过滤器
 */
export interface TaskFilters {
  status?: string;
  goalId?: string;
  dueDateFrom?: number;
  dueDateTo?: number;
  limit?: number;
  offset?: number;
}

/**
 * TaskPlan 仓储接口
 */
export interface ITaskPlanRepository {
  /**
   * 保存任务模板（创建或更新）
   */
  save(template: TaskPlan): Promise<void>;

  /**
   * 根据 ID + identity 查找任务模板（唯一授权敏感读路径）
   */
  findByIdForIdentity(identityId: string, id: string): Promise<TaskPlan | null>;

  /**
   * 根据 ID + identity 查找任务模板（包含实例）
   */
  findByIdWithChildren(identityId: string, id: string): Promise<TaskPlan | null>;

  /**
   * 根据用户 ID 查找所有任务模板
   */
  findByIdentityId(identityId: string): Promise<TaskPlan[]>;

  /**
   * 根据状态查找任务模板
   */
  findByStatus(identityId: string, status: TaskPlanStatus): Promise<TaskPlan[]>;

  /**
   * 查找活跃的任务模板
   */
  findActiveTemplates(identityId: string): Promise<TaskPlan[]>;

  /**
   * 根据目标查找任务模板（identity-scoped）
   */
  findByGoalId(identityId: string, goalId: string): Promise<TaskPlan[]>;

  /** Shared Label AND filtering for vNext classification. */
  findByLabelIdsAll(identityId: string, labelIds: readonly string[]): Promise<TaskPlan[]>;

  /** Replace shared Label assignment inside the owning Task mutation transaction. */
  replaceLabels(
    identityId: string,
    taskPlanId: string,
    labelIds: readonly string[],
  ): Promise<LabelClientDTO[]>;

  /**
   * 查找需要生成实例的模板（供定时任务使用）
   */
  findNeedGenerateInstances(toDate: number): Promise<TaskPlan[]>;

  /**
   * 全量模板引用（R1-4 projection reconcile 用）。
   * 返回所有用户的 (id, identityId)，供投影 runtime 启动时全量对账；
   * 所有宿主都必须枚举其本地权威范围；API 可跨 identity，Desktop 枚举已同步到本地 profile 的行。
   */
  findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>>;

  /**
   * 硬删除任务模板（identity-scoped）
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * 软删除任务模板
   */
  softDelete(identityId: string, id: string): Promise<void>;

  /**
   * 恢复软删除的任务模板
   */
  restore(identityId: string, id: string): Promise<void>;

  // ===== 任务类型查询 =====

  /**
   * 查找一次性任务（带过滤器）
   */
  findOneTimeTasks(identityId: string, filters?: TaskFilters): Promise<TaskPlan[]>;

  /**
   * 查找循环任务（带过滤器）
   */
  findRecurringTasks(identityId: string, filters?: TaskFilters): Promise<TaskPlan[]>;

  /**
   * 根据关键结果查找任务（identity-scoped）
   */
  findByKeyResultId(identityId: string, keyResultId: string): Promise<TaskPlan[]>;

  /**
   * 查找即将到期的任务（未来N天内）
   */
  findUpcomingTasks(identityId: string, daysAhead: number): Promise<TaskPlan[]>;

  /**
   * 查找今日任务
   */
  findTodayTasks(identityId: string): Promise<TaskPlan[]>;

  /**
   * 统计任务数量（按条件）
   */
  countTasks(identityId: string, filters?: TaskFilters): Promise<number>;

  /**
   * 批量保存任务
   */
  saveBatch(templates: TaskPlan[]): Promise<void>;

  /**
   * 批量删除任务
   */
  deleteBatch(identityId: string, ids: string[]): Promise<void>;
}
