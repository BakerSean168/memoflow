/**
 * GoalReminderConfig 值对象
 *
 * 【规范说明：Class 类型值对象 - 参考 domain-class-value-object-spec.md】
 *
 * 目标提醒配置：包含总开关和多个触发器配置
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  GoalReminderConfig as IGoalReminderConfig,
  GoalReminderConfigDTO,
  ReminderTrigger,
  ReminderTriggerType,
} from '@memoflow/contracts/goal';

/**
 * GoalReminderConfig 值对象实现
 *
 * 包含：
 * - enabled: 提醒总开关
 * - triggers: 触发器列表（支持多个不同类型的触发器）
 */
export class GoalReminderConfig
  extends ValueObject<GoalReminderConfigDTO>
  implements IGoalReminderConfig
{
  private constructor(props: GoalReminderConfigDTO) {
    super(props);
  }

  // ================= 工厂方法 1: 标准创建 =================
  /**
   * 创建新的值对象（包含校验）
   */
  public static create(props: GoalReminderConfigDTO): GoalReminderConfig {
    this.validate(props);
    return new GoalReminderConfig(props);
  }

  // ================= 工厂方法 2: 创建默认值 =================
  /**
   * 生成业务默认状态
   * 场景: 创建新目标时，生成默认提醒配置（禁用）
   */
  public static createDefault(): GoalReminderConfig {
    return new GoalReminderConfig({
      enabled: false,
      triggers: [],
    });
  }

  // ================= 工厂方法 3: 从 DTO 恢复 =================
  /**
   * 从 DTO 恢复值对象
   */
  public static fromDTO(dto: GoalReminderConfigDTO): GoalReminderConfig {
    return new GoalReminderConfig(dto);
  }

  // ================= 内部校验逻辑 =================
  /**
   * 集中校验逻辑
   */
  private static validate(props: GoalReminderConfigDTO): void {
    // 触发器列表校验
    if (!Array.isArray(props.triggers)) {
      throw new Error('Triggers must be an array');
    }

    // 触发器数量限制（最多 10 个）
    if (props.triggers.length > 10) {
      throw new Error('Too many triggers (max 10)');
    }

    // 每个触发器的校验
    for (const trigger of props.triggers) {
      if (trigger.value < 0) {
        throw new Error('Trigger value must be non-negative');
      }
      if (trigger.type === 'TimeProgressPercentage' && trigger.value > 100) {
        throw new Error('Trigger value must be between 0-100 for percentage triggers');
      }
    }
  }

  // ================= Getters（只读暴露）=================

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get triggers(): ReminderTrigger[] {
    return [...this.props.triggers];
  }

  // ================= 行为方法（不可变变更）=================

  /**
   * 启用/禁用提醒
   */
  public setEnabled(enabled: boolean): GoalReminderConfig {
    return new GoalReminderConfig({ ...this.props, enabled });
  }

  /**
   * 添加触发器
   */
  public addTrigger(trigger: ReminderTrigger): GoalReminderConfig {
    const triggers = [...this.props.triggers, trigger];
    const newProps = { ...this.props, triggers };
    GoalReminderConfig.validate(newProps);
    return new GoalReminderConfig(newProps);
  }

  /**
   * 移除触发器（根据类型和值）
   */
  public removeTrigger(type: ReminderTriggerType, value: number): GoalReminderConfig {
    const triggers = this.props.triggers.filter((t) => !(t.type === type && t.value === value));
    return new GoalReminderConfig({ ...this.props, triggers });
  }

  /**
   * 更新触发器启用状态
   */
  public updateTriggerEnabled(
    type: ReminderTriggerType,
    value: number,
    enabled: boolean,
  ): GoalReminderConfig {
    const triggers = this.props.triggers.map((t) =>
      t.type === type && t.value === value ? { ...t, enabled } : t,
    );
    return new GoalReminderConfig({ ...this.props, triggers });
  }

  /**
   * 清空所有触发器
   */
  public clearTriggers(): GoalReminderConfig {
    return new GoalReminderConfig({ ...this.props, triggers: [] });
  }

  // ================= 计算属性（Rich Logic）=================

  /**
   * 是否有启用的触发器
   */
  public get hasEnabledTriggers(): boolean {
    return this.props.triggers.some((t) => t.enabled);
  }

  /**
   * 启用的触发器数量
   */
  public get enabledTriggersCount(): number {
    return this.props.triggers.filter((t) => t.enabled).length;
  }

  /**
   * 获取启用的触发器
   */
  public getEnabledTriggers(): ReminderTrigger[] {
    return this.props.triggers.filter((t) => t.enabled);
  }

  // ================= 序列化方法 =================

  /**
   * 转换为 DTO（用于 API 传输或前端展示）
   */
  public toDTO(): GoalReminderConfigDTO {
    return {
      enabled: this.props.enabled,
      triggers: [...this.props.triggers],
    };
  }
}
