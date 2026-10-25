/**
 * Goal Module - Infrastructure Client
 *
 * Adapters for Goal module communication.
 */

// Port Interfaces
export type { IGoalApiClient, IResultHttpClient, IResultIpcClient } from './adapters/types';

// HTTP Adapters
export { GoalHttpAdapter, createGoalHttpAdapters, type GoalHttpAdapters } from './adapters/http';

// IPC Adapters
export { GoalIpcAdapter, createGoalIpcAdapters, type GoalIpcAdapters } from './adapters/ipc';
