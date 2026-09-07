/**
 * Schedule Scheduler Module
 *
 * 优先队列调度器及相关组件
 *
 * @module server/application/schedule/scheduler
 */

// 从 patterns 包导出通用框架
export type { IScheduleTimer } from '@memoflow/patterns/scheduler';
export { NodeTimer, FakeTimer } from '@memoflow/patterns/scheduler';

export type { HeapItem } from '@memoflow/patterns/scheduler';
export { MinHeap } from '@memoflow/patterns/scheduler';

export type {
  IScheduleMonitor,
  ScheduleExecutionStats,
  ScheduleExecutionRecord,
} from '@memoflow/patterns/scheduler';
export { NoopScheduleMonitor, InMemoryScheduleMonitor } from '@memoflow/patterns/scheduler';

// 优先队列调度器
export type {
  ScheduleTaskQueueConfig,
  ScheduleTaskQueueStatus,
  ScheduledItem,
  IScheduleTaskLoader,
  IScheduleLogger,
  MissedTasksResult,
} from './schedule-task-queue';
export { ScheduleTaskQueue, ConsoleScheduleLogger } from './schedule-task-queue';
