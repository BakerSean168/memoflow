/**
 * 任务调度模式
 */
export const TaskScheduleMode = {
  Once: 'Once', // 单次任务
  Daily: 'Daily', // 每天
  Weekly: 'Weekly', // 每周
  Monthly: 'Monthly', // 每月
  Custom: 'Custom', // 自定义
} as const;

export type TaskScheduleMode = (typeof TaskScheduleMode)[keyof typeof TaskScheduleMode];
