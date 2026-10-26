/**
 * TaskReminderConfig 值对象
 *
 * 【规范说明：Class 类型值对象 - 参考 domain-class-value-object-spec.md】
 *
 * 任务提醒配置：包含总开关和多个触发器配置
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  TaskReminderConfig as ITaskReminderConfig,
  TaskReminderConfigDTO,
  TaskReminderType,
  ReminderTimeUnit,
} from '@memoflow/task-contracts';

/**
 * 单个提醒触发器
 */
interface ReminderTrigger {
  type: TaskReminderType;
  absoluteTime: number | null; // 绝对时间（时间戳）
  relativeValue: number | null; // 相对时间值（如 30）
  relativeUnit: ReminderTimeUnit | null; // 相对时间单位（如 Minutes）
}

/**
 * TaskReminderConfig 值对象实现
 *
 * 包含：
 * - enabled: 提醒总开关
 * - triggers: 触发器列表
 */
export class TaskReminderConfig
  extends ValueObject<TaskReminderConfigDTO>
  implements ITaskReminderConfig
{
  private constructor(props: TaskReminderConfigDTO) {
    super(props);
  }

  // ================= 工厂方法 1: 标准创建 =================
  /**
   * 创建新的值对象（包含校验）
   */
  public static create(props: TaskReminderConfigDTO): TaskReminderConfig {
    this.validate(props);
    return new TaskReminderConfig(props);
  }

  // ================= 工厂方法 2: 创建默认值（禁用）=================
  /**
   * 生成业务默认状态（禁用）
   */
  public static createDefault(): TaskReminderConfig {
    return new TaskReminderConfig({
      enabled: false,
      triggers: [],
    });
  }

  // ================= 工厂方法 3: 创建相对时间提醒 =================
  /**
   * 创建相对时间提醒（如任务开始前 30 分钟）
   */
  public static createRelativeReminder(value: number, unit: ReminderTimeUnit): TaskReminderConfig {
    return new TaskReminderConfig({
      enabled: true,
      triggers: [
        {
          type: 'Relative',
          absoluteTime: null,
          relativeValue: value,
          relativeUnit: unit,
        },
      ],
    });
  }

  // ================= 工厂方法 4: 从 DTO 恢复 =================
  /**
   * 从 DTO 恢复值对象
   */
  public static fromDTO(dto: TaskReminderConfigDTO): TaskReminderConfig {
    return new TaskReminderConfig(dto);
  }

  // ================= 内部校验逻辑 =================
  /**
   * 集中校验逻辑
   */
  private static validate(props: TaskReminderConfigDTO): void {
    if (!Array.isArray(props.triggers)) {
      throw new Error('Triggers must be an array');
    }

    if (props.triggers.length > 10) {
      throw new Error('Too many triggers (max 10)');
    }

    for (const trigger of props.triggers) {
      if (trigger.type === 'Absolute' && trigger.absoluteTime === null) {
        throw new Error('Absolute reminder requires absoluteTime');
      }
      if (trigger.type === 'Relative') {
        if (trigger.relativeValue === null || trigger.relativeUnit === null) {
          throw new Error('Relative reminder requires relativeValue and relativeUnit');
        }
        if (trigger.relativeValue < 0) {
          throw new Error('Relative value must be non-negative');
        }
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
  public setEnabled(enabled: boolean): TaskReminderConfig {
    return new TaskReminderConfig({ ...this.props, enabled });
  }

  /**
   * 添加相对时间触发器
   */
  public addRelativeTrigger(value: number, unit: ReminderTimeUnit): TaskReminderConfig {
    const triggers = [
      ...this.props.triggers,
      {
        type: 'Relative' as TaskReminderType,
        absoluteTime: null,
        relativeValue: value,
        relativeUnit: unit,
      },
    ];
    const newProps = { ...this.props, triggers };
    TaskReminderConfig.validate(newProps);
    return new TaskReminderConfig(newProps);
  }

  /**
   * 添加绝对时间触发器
   */
  public addAbsoluteTrigger(absoluteTime: number): TaskReminderConfig {
    const triggers = [
      ...this.props.triggers,
      {
        type: 'Absolute' as TaskReminderType,
        absoluteTime,
        relativeValue: null,
        relativeUnit: null,
      },
    ];
    const newProps = { ...this.props, triggers };
    TaskReminderConfig.validate(newProps);
    return new TaskReminderConfig(newProps);
  }

  /**
   * 清空所有触发器
   */
  public clearTriggers(): TaskReminderConfig {
    return new TaskReminderConfig({ ...this.props, triggers: [] });
  }

  // ================= 计算属性（Rich Logic）=================

  /**
   * 是否有触发器
   */
  public get hasTriggers(): boolean {
    return this.props.triggers.length > 0;
  }

  /**
   * 触发器数量
   */
  public get triggersCount(): number {
    return this.props.triggers.length;
  }

  /**
   * 是否有效（启用且有触发器）
   */
  public get isEffective(): boolean {
    return this.props.enabled && this.hasTriggers;
  }

  // ================= 序列化方法 =================

  /**
   * 转换为 DTO（用于 API 传输或前端展示）
   */
  public toDTO(): TaskReminderConfigDTO {
    return {
      enabled: this.props.enabled,
      triggers: [...this.props.triggers],
    };
  }
}
