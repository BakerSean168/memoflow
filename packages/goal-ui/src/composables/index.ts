/**
 * Goal Composables - Barrel Export
 */

export { useGoal } from './useGoal';
export { useGoalWorkspace } from './useGoalWorkspace';
export { useGoalHomeSummary } from './useGoalHomeSummary';
export { useGoalFilters } from './useGoalFilters';
export { useGoalTimeline } from './useGoalTimeline';
export { useWeightSnapshot } from './useWeightSnapshot';
export type { TimelineData, TimelineSnapshot } from '../utils/goal-timeline';
export { formatTimelineTimestamp } from '../utils/goal-timeline';

// Surface host ports (contracts owned by Goal, implemented by the host shell)
export {
  useGoalNativeSurface,
  useGoalNativeSurfaceRegistration,
  useGoalSurfaceStatus,
  useGoalSurfaceLeaveGuard,
  GoalNativeSurfaceKey,
  GoalSurfaceStatusSinkKey,
  GoalSurfaceLeaveGuardKey,
} from './goalSurfaceHost';
export type {
  GoalAIEditSurface,
  GoalNativeSurfaceHost,
  GoalSurfaceStatus,
  GoalSurfaceStatusSink,
  GoalSurfaceLeaveGuard,
} from './goalSurfaceHost';
