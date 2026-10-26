/**
 * 任务提醒类型（Task 模块专用）
 */
export const TaskReminderType = {
  Absolute: 'Absolute', // 绝对时间提醒
  Relative: 'Relative', // 相对时间提醒
} as const;

export type TaskReminderType = (typeof TaskReminderType)[keyof typeof TaskReminderType];
