/**
 * 任务实例状态（循环任务的实例）
 */
export const TaskOccurrenceStatus = {
  Pending: 'Pending', // 待处理
  InProgress: 'InProgress', // 进行中
  Completed: 'Completed', // 已完成
  Missed: 'Missed', // 明确记录的未完成事实
  Skipped: 'Skipped', // 豁免 / 不适用
} as const;

export type TaskOccurrenceStatus = (typeof TaskOccurrenceStatus)[keyof typeof TaskOccurrenceStatus];
