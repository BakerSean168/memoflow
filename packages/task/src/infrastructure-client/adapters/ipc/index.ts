/**
 * Task IPC Adapters - Registration
 *
 * Barrel file for all IPC-based Task adapters.
 * Provides factory function to create all IPC adapters at once.
 */

import type { IResultIpcClient } from '../types';
import { TaskPlanIpcAdapter } from './task-plan-ipc.adapter';
import { TaskOccurrenceIpcAdapter } from './task-occurrence-ipc.adapter';

// Re-export adapters
export { TaskPlanIpcAdapter } from './task-plan-ipc.adapter';
export { TaskOccurrenceIpcAdapter } from './task-occurrence-ipc.adapter';
export { createTaskPlanIpcAdapter } from './task-plan-ipc.adapter';
export { createTaskOccurrenceIpcAdapter } from './task-occurrence-ipc.adapter';

/**
 * All IPC adapters for the Task module
 */
export interface TaskIpcAdapters {
  template: TaskPlanIpcAdapter;
  instance: TaskOccurrenceIpcAdapter;
}

/**
 * Create all Task IPC adapters from a single IResultIpcClient instance.
 * Desktop DI injects ResultIpcClient from createResultIpcClient().
 *
 * @example
 * ```ts
 * const ipcClient = createResultIpcClient({ bridge });
 * const adapters = createTaskIpcAdapters(ipcClient);
 * ```
 */
export function createTaskIpcAdapters(ipcClient: IResultIpcClient): TaskIpcAdapters {
  return {
    template: new TaskPlanIpcAdapter(ipcClient),
    instance: new TaskOccurrenceIpcAdapter(ipcClient),
  };
}
