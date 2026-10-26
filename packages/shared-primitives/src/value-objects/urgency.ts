export const UrgencyLevel = {
  /**
   * 非常紧急 - 需要立即处理
   * 示例: 药物提醒、紧急会议
   */
  Critical: 'Critical',

  /**
   * 高度紧急 - 今天必须处理
   * 示例: 当天截止的工作任务
   */
  High: 'High',

  /**
   * 中等紧急 - 近期需要处理
   * 示例: 本周需要完成的报告
   */
  Medium: 'Medium',

  /**
   * 低度紧急 - 可以稍后处理
   * 示例: 长期学习计划
   */
  Low: 'Low',

  /**
   * 无期限 - 没有具体时间要求
   * 示例: 兴趣学习、休闲活动
   */
  None: 'None',
} as const;
export type UrgencyLevel = (typeof UrgencyLevel)[keyof typeof UrgencyLevel];
