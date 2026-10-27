/**
 * 时间类型
 */
export const TaskTimeType = {
  AllDay: 'AllDay', // 全天任务
  TimePoint: 'TimePoint', // 时间点任务
  TimeRange: 'TimeRange', // 时间段任务
} as const;

export type TaskTimeType = (typeof TaskTimeType)[keyof typeof TaskTimeType];
