/**
 * 重复频率
 */
export const RecurrenceFrequency = {
  Daily: 'Daily', // 每天
  Weekly: 'Weekly', // 每周
  Monthly: 'Monthly', // 每月
  Yearly: 'Yearly', // 每年
} as const;

export type RecurrenceFrequency = (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];
