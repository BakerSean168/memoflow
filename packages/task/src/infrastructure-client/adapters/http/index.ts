/**
 * Task HTTP Adapters - Registration
 *
 * Barrel file for all HTTP-based Task adapters.
 * Provides factory function to create all HTTP adapters at once.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import { TaskPlanHttpAdapter } from './task-plan-http.adapter';
import { TaskOccurrenceHttpAdapter } from './task-occurrence-http.adapter';

// Re-export adapters
export { TaskPlanHttpAdapter } from './task-plan-http.adapter';
export { TaskOccurrenceHttpAdapter } from './task-occurrence-http.adapter';
export { createTaskPlanHttpAdapter } from './task-plan-http.adapter';
export { createTaskOccurrenceHttpAdapter } from './task-occurrence-http.adapter';

/**
 * All HTTP adapters for the Task module
 */
export interface TaskHttpAdapters {
  template: TaskPlanHttpAdapter;
  instance: TaskOccurrenceHttpAdapter;
}

/**
 * Create all Task HTTP adapters from a single IResultHttpClient instance.
 * The concrete implementation (e.g. ResultHttpClient) is created at the App layer.
 *
 * @example
 * ```ts
 * // apps/web/src/infrastructure/task.ts
 * const httpClient = createResultHttpClient({ baseURL: '/api' });
 * const adapters = createTaskHttpAdapters(httpClient);
 * // register adapters in the app composition root
 * ```
 */
export function createTaskHttpAdapters(httpClient: IResultHttpClient): TaskHttpAdapters {
  return {
    template: new TaskPlanHttpAdapter(httpClient),
    instance: new TaskOccurrenceHttpAdapter(httpClient),
  };
}
