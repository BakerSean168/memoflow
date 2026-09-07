import { ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '../../domain/aggregates/schedule-task';

export interface IScheduleTaskMonitor {
  recordExecutionStart(taskId: string, taskName: string): void;
  recordExecutionSuccess(taskId: string, taskName: string): void;
  recordExecutionFailure(taskId: string, taskName: string, error: Error): void;
  recordExecutionSkipped(taskId: string, taskName: string, reason: string): void;
}

/**
 * 获取任务不能执行的原因
 */
export function getCannotExecuteReason(task: ScheduleTask): string {
  if (task.status !== ScheduleTaskStatus.Active) {
    return `任务状态不是 Active: ${task.status}`;
  }
  if (!task.enabled) {
    return '任务未启用';
  }
  const nextRunAt = task.nextRunAt;
  if (!nextRunAt || nextRunAt > new Date()) {
    return `任务尚未到执行时间: ${nextRunAt?.toISOString() || 'N/A'}`;
  }
  const maxExecutions = task.maxExecutions;
  const executionCount = task.executionCount;
  if (maxExecutions && executionCount >= maxExecutions) {
    return `已达到最大执行次数: ${executionCount}/${maxExecutions}`;
  }
  return '未知原因';
}
