/**
 * Priority Level - 通用优先级等级
 *
 * 5级优先级系统，适用于 Goal、Task、Reminder 等所有需要优先级的实体
 * 与 ImportanceLevel（重要性）和 UrgencyLevel（紧急性）配合使用
 */

/**
 * 优先级等级
 * Priority Level Enum
 *
 * 基于 ImportanceLevel 和 UrgencyLevel 计算得出的最终优先级
 * 计算公式见 @memoflow/utils 中的 calculatePriority 函数
 */
export const PriorityLevel = {
  /**
   * 紧急 - 最高优先级，需要立即处理
   * 通常是 vital + critical 的组合
   */
  Critical: 'Critical',

  /**
   * 高优先级 - 今天必须处理
   * 通常是 important + high 的组合
   */
  High: 'High',

  /**
   * 中等优先级 - 近期需要处理
   * 通常是 moderate + medium 的组合
   */
  Medium: 'Medium',

  /**
   * 低优先级 - 可以稍后处理
   * 通常是 minor + low 的组合
   */
  Low: 'Low',

  /**
   * 无优先级 - 没有具体时间要求
   * 通常是 trivial + none 的组合
   */
  None: 'None',
} as const;
export type PriorityLevel = (typeof PriorityLevel)[keyof typeof PriorityLevel];
