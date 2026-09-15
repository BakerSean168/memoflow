/**
 * Task 模块配置常量
 */

/**
 * 任务实例生成配置
 */
export const TASK_OCCURRENCE_GENERATION_CONFIG = {
  /**
   * 目标提前生成天数
   * 系统会自动维护每个模板有未来 100 天内的所有实例
   */
  TARGET_GENERATE_AHEAD_DAYS: 100,

  /**
   * 补充阈值（天）
   * 当剩余实例的最远日期距离现在少于此天数时，自动补充到目标天数
   */
  REFILL_THRESHOLD_DAYS: 100,

  /**
   * 批量操作的批次大小
   */
  BATCH_SIZE: 50,
} as const;

/**
 * 任务实例查看范围配置
 */
export const TASK_OCCURRENCE_VIEW_CONFIG = {
  /**
   * 默认查看范围（天）
   */
  DEFAULT_VIEW_RANGE_DAYS: 30,

  /**
   * 最大查看范围（天）
   */
  MAX_VIEW_RANGE_DAYS: 100,
} as const;

/**
 * 重复规则默认配置
 */
export const RECURRENCE_RULE_DEFAULTS = {
  /**
   * 默认结束日期距离今天的天数
   * 当选择"结束日期"时，默认设置为 30 天后
   */
  DEFAULT_END_DATE_DAYS: 30,

  /**
   * 默认重复次数
   * 当选择"次数限制"时的默认次数
   */
  DEFAULT_OCCURRENCES: 10,

  /**
   * 默认重复间隔
   */
  DEFAULT_INTERVAL: 1,
} as const;
