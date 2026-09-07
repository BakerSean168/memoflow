/**
 * ReminderGroup 仓储接口
 *
 * DDD 仓储模式：
 * - 只定义接口，不实现
 * - 由基础设施层实现
 * - 使用依赖注入
 * - 隐藏数据访问细节
 */

import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderStatus } from '@memoflow/contracts/reminder';

/**
 * IReminderGroupRepository 仓储接口
 *
 * 职责：
 * - 定义 ReminderGroup 聚合根的持久化操作契约
 * - 聚合根是操作的基本单位
 */
export interface IReminderGroupRepository {
  /**
   * 保存聚合根（创建或更新）
   *
   * @param group ReminderGroup 聚合根
   */
  save(group: ReminderGroup): Promise<void>;

  /**
   * 通过 identity + ID 查找分组（唯一读路径）
   */
  findByIdForIdentity(identityId: string, id: string): Promise<ReminderGroup | null>;

  /**
   * 通过身份 ID 查找所有提醒分组
   *
   * @param identityId 身份 ID
   * @param options.includeDeleted 是否包含已删除的分组（默认 false）
   * @returns 提醒分组列表
   */
  findByIdentityId(
    identityId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ReminderGroup[]>;

  /**
   * 查找所有活跃的提醒分组
   *
   * @param identityId 身份 ID
   * @returns 活跃的提醒分组列表
   */
  findActive(identityId: string): Promise<ReminderGroup[]>;

  /**
   * 批量查找提醒分组（identity-scoped）
   *
   * @param identityId 身份 ID
   * @param ids ID 列表
   * @returns 提醒分组列表
   */
  findByIds(identityId: string, ids: string[]): Promise<ReminderGroup[]>;

  /**
   * 通过名称查找分组（用于防重复检查）
   *
   * @param identityId 身份 ID
   * @param name 分组名称
   * @param excludeId 排除的 ID（用于更新时检查）
   * @returns 分组实例，不存在则返回 null
   */
  findByName(
    identityId: string,
    name: string,
    excludeId?: string,
  ): Promise<ReminderGroup | null>;

  /**
   * 删除聚合根
   *
   * @param id 提醒分组 ID
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * 检查提醒分组是否存在
   *
   * @param id 提醒分组 ID
   */
  exists(identityId: string, id: string): Promise<boolean>;

  /**
   * 统计身份下的提醒分组数量
   *
   * @param identityId 身份 ID
   * @param options.status 按状态筛选
   * @param options.includeDeleted 是否包含已删除的分组
   * @returns 提醒分组数量
   */
  count(
    identityId: string,
    options?: { status?: ReminderStatus; includeDeleted?: boolean },
  ): Promise<number>;
}
