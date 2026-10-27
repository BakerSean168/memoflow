/**
 * Schedule UI - Public Exports
 *
 * @module schedule-ui
 */

// Store
export { useScheduleStore } from './stores/schedule-store';
export type { ScheduleStoreType } from './stores/schedule-store';

// Composables
export { useSchedule } from './composables';
export {
  calendarEventSourceLabel,
  formatCapsuleTime,
  formatScheduleCapsuleLabel,
  resolveScheduleCapsule,
  taskOccurrencesToEvents,
  toLocalDateKey,
  useCalendarView,
  type CalendarEventItem,
  type ScheduleCapsuleSnapshot,
} from './composables/useCalendarView';

// Canonical owner-aware Planner read projection (PLAN-4302)
export * from './planner';
export * from './planner/planner-presentation';
export {
  default as PlannerCalendar,
  type PlannerCalendarView,
  type PlannerVisibleRange,
} from './planner/PlannerCalendar.vue';
export type {
  CalendarEventProjection,
  PlannerEditableCapabilities,
  PlannerOwnerCommandTarget,
  PlannerSourceType,
} from '@memoflow/schedule-contracts';

// Views
export { default as ScheduleCalendarView } from './views/ScheduleCalendarView.vue';

// Routes
export { scheduleRoutes } from './router';

// Components
export * from './components';

// Host composition
export {
  bindScheduleUiHost,
  scheduleUiHost,
  type FetchRoutineUpcomingCachedOptions,
  type PanelSurfaceStatus,
  type RoutineUpcomingOccurrence,
  type ScheduleGoalPort,
  type ScheduleTaskPlannerPort,
  type ScheduleUiHost,
} from './schedule-ui-host';
