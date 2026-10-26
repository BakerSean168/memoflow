/**
 * 提醒触发类型（Goal 模块专用）
 */
export const ReminderTriggerType = {
  AbsoluteAt: 'AbsoluteAt', // 绝对时间点（epoch ms）
  TimeProgressPercentage: 'TimeProgressPercentage', // legacy: 时间进度百分比
  RemainingDays: 'RemainingDays', // 目标日前 N 天
} as const;

export type ReminderTriggerType = (typeof ReminderTriggerType)[keyof typeof ReminderTriggerType];
