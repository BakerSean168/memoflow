/**
 * Task Module - Public Exports
 *
 * @module modules/task
 */

// Types

// Store (occurrences/currentOccurrence + UI state; plans live in the query cache)
export { useTaskStore } from './stores/task-store';
export type { TaskStoreType } from './stores/task-store';

// Composables
export { useTask } from './composables/useTask';
export {
  useTaskPlanListQuery,
  useTaskPlanDetailQuery,
  useTaskPlanMutations,
  type CreatePlanFeedbackIntent,
} from './composables';

// Routes
export { taskRoutes } from './router';

// Components
export * from './components';
