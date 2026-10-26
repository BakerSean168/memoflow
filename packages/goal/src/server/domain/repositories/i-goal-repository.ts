/**
 * Goal 聚合根仓储接口
 *
 * DDD 仓储模式：
 * - 只定义接口，不实现
 * - 由基础设施层实现（Prisma / SQLite）
 * - 使用依赖注入
 * - 隐藏数据访问细节
 */

import type  { GoalSystemView } from '@memoflow/goal-contracts';
import type  { LabelDto } from '@memoflow/label-contracts';
import type { Goal } from '../aggregates/goal';

export class GoalVersionConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  constructor() {
    super('Goal has been modified by another client');
  }
}

export class GoalLabelOwnershipError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor() {
    super('One or more labels do not belong to the identity.');
    this.name = 'GoalLabelOwnershipError';
  }
}

/**
 * IGoalRepository 仓储接口
 *
 * 职责：
 * - 定义持久化操作的契约
 * - 聚合根是操作的基本单位
 * - 级联保存/加载子实体（KeyResult, GoalReview, WeightSnapshot）
 */
export interface IGoalRepository {
  /**
   * 保存聚合根（创建或更新）
   *
   * 注意：
   * - 这是事务操作
   * - 级联保存所有子实体（KeyResult, GoalReview）
   * - 如果 ID 已存在则更新，否则插入
   * - WeightSnapshot 只做插入（不可变审计记录）
   */
  save(goal: Goal): Promise<void>;
  saveRootWithExpectedVersion(goal: Goal, expectedVersion: number): Promise<void>;

  /**
   * 通过 identity + ID 查找聚合根（身份隔离读路径）
   *
   * @param identityId - 用户身份 ID
   * @param id - 目标 ID
   * @param options.includeChildren - 是否加载子实体
   * @returns 聚合根实例，不存在或不属于该 identity 则返回 null
   */
  findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeChildren?: boolean },
  ): Promise<Goal | null>;

  /** Load identity-scoped goals using derived system views. */
  findByIdentityId(
    identityId: string,
    options?: {
      includeChildren?: boolean;
      status?: string;
      systemView?: GoalSystemView;
      labelIdsAll?: readonly string[];
    },
  ): Promise<Goal[]>;

  /** Goal-owned shared-label assignment. Must be called inside the owning mutation transaction. */
  replaceLabels(
    identityId: string,
    goalId: string,
    labelIds: readonly string[],
  ): Promise<LabelDto[]>;

  /** Loads the owning goal aggregate for a key result within one identity. */
  findByKeyResultIdForIdentity(identityId: string, keyResultId: string): Promise<Goal | null>;

  /**
   * Lists identity-scoped goal references for schedule projection ownership
   * enumeration. Prisma 扫描全部 identity；PowerSync 本地宿主枚举自身 goals 行，
   * 保证 API 与 Desktop 的启动 reconcile 行为等价。
   */
  findAllGoalRefs(): Promise<Array<{ id: string; identityId: string }>>;

  /**
   * 永久删除聚合根（物理删除，必须同时匹配 identity）
   *
   * 注意：
   * - 这是事务操作
   * - 级联删除所有子实体
   * - 仅在聚合根已归档时允许删除（由 use case 层保证）
   *
   * @param identityId - 用户身份 ID
   * @param id - 目标 ID
   */
  delete(identityId: string, id: string): Promise<void>;
  deleteWithExpectedVersion(identityId: string, id: string, expectedVersion: number): Promise<void>;

  /**
   * 检查目标是否存在
   *
   * @param id - 目标 ID
   */
  exists(identityId: string, id: string): Promise<boolean>;

  /**
   * 批量更新状态
   *
   * @param ids - 目标 ID 列表
   * @param status - 新状态
   */
  batchUpdateStatus(identityId: string, ids: string[], status: string): Promise<void>;
}
