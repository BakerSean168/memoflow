/**
 * Goal HTTP Adapters - Registration
 *
 * Barrel file for all HTTP-based Goal adapters.
 * Provides factory function to create all HTTP adapters at once.
 */

import type { IResultHttpClient } from '../types';
import { GoalHttpAdapter } from './goal-http.adapter';

// Re-export adapters
export { GoalHttpAdapter } from './goal-http.adapter';

/**
 * All HTTP adapters for the Goal module
 */
export interface GoalHttpAdapters {
  goal: GoalHttpAdapter;
}

/**
 * Create all Goal HTTP adapters from a single IResultHttpClient instance.
 * The concrete implementation (e.g. ResultHttpClient) is created at the App layer.
 *
 * @example
 * ```ts
 * // apps/web/src/infrastructure/goal.ts
 * const httpClient = createResultHttpClient({ baseURL: '/api' });
 * const adapters = createGoalHttpAdapters(httpClient);
 * // register adapters in the app composition root
 * ```
 */
export function createGoalHttpAdapters(httpClient: IResultHttpClient): GoalHttpAdapters {
  return {
    goal: new GoalHttpAdapter(httpClient),
  };
}
