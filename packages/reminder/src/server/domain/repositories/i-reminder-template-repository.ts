/**
 * ReminderTemplate 仓储接口
 *
 * DDD 仓储模式：
 * - 只定义接口，不实现
 * - 由基础设施层实现
 * - 使用依赖注入
 * - 隐藏数据访问细节
 */

import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { ReminderStatus } from '@memoflow/contracts/reminder';

/**
 * IReminderTemplateRepository 仓储接口
 *
 * 职责：
 * - 定义 ReminderTemplate 聚合根的持久化操作契约
 * - 聚合根是操作的基本单位
 * - 级联保存/加载子实体（ReminderHistory）
 */
export interface IReminderTemplateRepository {
  /**
   * 保存聚合根（创建或更新）
   *
   * @param template ReminderTemplate 聚合根
   */
  save(template: ReminderTemplate): Promise<void>;

  /**
   * 通过 identity + ID 查找聚合根（身份隔离读路径）
   * 不存在或不属于该 identity 时返回 null
   */
  findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate | null>;

  /**
   * 通过身份 ID 查找所有提醒模板
   *
   * @param identityId 身份 ID
   * @param options.includeHistory 是否加载历史记录
   * @param options.includeDeleted 是否包含已删除的模板（默认 false）
   * @returns 提醒模板列表
   */
  findByIdentityId(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number; includeDeleted?: boolean },
  ): Promise<ReminderTemplate[]>;

  /** Identity-scoped authority scan used by durable schedule projection repair. */
  findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>>;

  /**
   * 查找所有活跃的提醒模板
   *
   * @param identityId 身份 ID
   * @returns 活跃的提醒模板列表
   */
  findActive(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]>;

  /**
   * 查找下次触发时间在指定时间之前的提醒模板（用于触发器调度）
   *
   * @param beforeTime 时间戳（毫秒）
   * @param identityId 身份 ID（可选）
   * @returns 待触发的提醒模板列表
   */
  findByNextTriggerBefore(beforeTime: number, identityId?: string): Promise<ReminderTemplate[]>;

  /**
   * 批量查找提醒模板
   *
   * @param ids ID 列表
   * @param options.includeHistory 是否加载历史记录
   * @returns 提醒模板列表
   */
  findByIds(
    identityId: string,
    ids: string[],
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]>;

  /**
   * 删除聚合根（级联删除子实体 ReminderHistory）
   *
   * @param id 提醒模板 ID
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * 检查提醒模板是否存在
   *
   * @param id 提醒模板 ID
   */
  exists(identityId: string, id: string): Promise<boolean>;

  /**
   * 统计身份下的提醒模板数量
   *
   * @param identityId 身份 ID
   * @param options.status 按状态筛选
   * @param options.includeDeleted 是否包含已删除的模板
   * @returns 提醒模板数量
   */
  count(
    identityId: string,
    options?: { status?: ReminderStatus; includeDeleted?: boolean },
  ): Promise<number>;
}
