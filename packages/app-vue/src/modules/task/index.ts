/**
 * Task Module - Public Exports
 *
 * @module modules/task
 */

// Types

// Store (instances/currentInstance + UI state; templates live in the query cache)
export { useTaskStore } from './stores/task-store';
export type { TaskStoreType } from './stores/task-store';

// Composables
export { useTask } from './composables/useTask';
export {
  useTaskPlanListQuery,
  useTaskPlanDetailQuery,
  useTaskPlanMutations,
  type CreateTemplateFeedbackIntent,
} from './composables';

// Routes
export { taskRoutes } from './router';

// Components
export * from './components';
