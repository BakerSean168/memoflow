/**
 * Goal Module - app-vue
 *
 * 目标模块的展示层：stores、composables、router、views、widgets、components。
 * 从 apps/web/src/modules/goal/ 和 packages/ui-vue-shadcn/src/components/custom/goal/ 迁移而来。
 */

// ===== Composables =====
export { useGoal } from './composables';
export { useGoalWorkspace } from './composables';
export { useGoalHomeSummary } from './composables';
export { useGoalTimeline } from './composables';
export type { TimelineData, TimelineSnapshot } from './composables';
export { formatTimelineTimestamp } from './composables';

// ===== Surface Host Ports =====
export {
  useGoalNativeSurface,
  useGoalNativeSurfaceRegistration,
  useGoalSurfaceStatus,
  useGoalSurfaceLeaveGuard,
  GoalNativeSurfaceKey,
  GoalSurfaceStatusSinkKey,
  GoalSurfaceLeaveGuardKey,
} from './composables';
export type {
  GoalAIEditSurface,
  GoalNativeSurfaceHost,
  GoalSurfaceStatus,
  GoalSurfaceStatusSink,
  GoalSurfaceLeaveGuard,
} from './composables';
export type {
  GoalNativeDraftState,
  GoalNativeEditSession,
  GoalNativeSubmitContext,
} from './composables/goalNativeEditSession';

// ===== Stores =====
export { useGoalStore } from './stores/goal-store';
export type { GoalState, GoalStoreType } from './stores/goal-store';

// ===== Router =====
export { goalRoutes } from './router';

// ===== Widgets =====

// ===== Components =====
export * from './components';

// ===== Calculation Presentation =====
export {
  KEY_RESULT_CALCULATION_METHODS,
  KEY_RESULT_CALCULATION_PRESENTATION,
  getKeyResultCalculationLabel,
  getKeyResultRecordPromptLabel,
} from './utils';

// ===== Startup Hook =====
export { createGoalStartupHook } from './initialization';

export { createGoalDraftCheckpointStore } from './infrastructure/goal-draft-checkpoint.indexeddb';
