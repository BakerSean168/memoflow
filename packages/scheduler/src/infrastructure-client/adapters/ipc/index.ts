import type { IResultIpcClient } from '../types';
import { ScheduleTaskIpcAdapter } from './schedule-task-ipc.adapter';
export { ScheduleTaskIpcAdapter } from './schedule-task-ipc.adapter';
export function createSchedulerIpcAdapter(ipcClient: IResultIpcClient): ScheduleTaskIpcAdapter {
  return new ScheduleTaskIpcAdapter(ipcClient);
}
