/**
 * Task Module - Infrastructure Client
 *
 * Adapters for Task module communication.
 */

// Port Interfaces
export type {
  ITaskPlanApiClient,
  ITaskOccurrenceApiClient,
  IResultIpcClient,
  TaskPlanListParams,
} from './adapters/types';

// HTTP Adapters
export {
  TaskPlanHttpAdapter,
  TaskOccurrenceHttpAdapter,
  createTaskHttpAdapters,
  type TaskHttpAdapters,
} from './adapters/http';

// IPC Adapters
export {
  TaskPlanIpcAdapter,
  TaskOccurrenceIpcAdapter,
  createTaskIpcAdapters,
  type TaskIpcAdapters,
} from './adapters/ipc';
