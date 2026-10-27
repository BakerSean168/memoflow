/**
 * Task UI Module - Public Exports
 *
 * @module task-ui
 */

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
export { useTaskToday } from './composables/useTaskToday';
export {
  useTaskOccurrenceActionCoordinator,
  type TaskOccurrenceOperations,
} from './composables/useTaskOccurrenceActionCoordinator';
export type {
  TaskNativeEditSession,
  TaskNativeSubmitContext,
} from './composables/taskNativeEditSession';

// Component view models & types
export type {
  GoalBindingOption,
  KeyResultBindingOption,
  TaskGoalBindingDisplay,
  TaskGoalBindingViewModel,
  TaskPlanFormEmits,
  TaskPlanFormProps,
  TaskPlanStateFilter,
  TaskPlanViewModel,
  TaskSurface,
} from './components/types';

// Shared task widgets and surfaces (consumed by the app shell and schedule surfaces)
export { default as TaskQuickSurface } from './components/TaskQuickSurface.vue';
export { default as TaskOccurrenceQuickSurface } from './components/TaskOccurrenceQuickSurface.vue';
export { default as DailyTodoWidget } from './components/widgets/DailyTodoWidget.vue';
export { default as WeekdaySelector } from './components/TaskPlanForm/widgets/WeekdaySelector.vue';
export { default as MonthDaySelector } from './components/TaskPlanForm/widgets/MonthDaySelector.vue';
export { default as TaskManagementView } from './views/TaskManagementView.vue';
export { default as TaskDetailView } from './views/TaskDetailView.vue';
export { default as TaskPlanDialog } from './components/dialogs/TaskPlanDialog.vue';

// Routes
export { taskRoutes } from './router';
