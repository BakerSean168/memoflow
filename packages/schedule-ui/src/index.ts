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
export {
  defaultPlannerProductTimePort,
  projectCalendarEntry,
  projectGoalDates,
  projectPlannerReadModel,
  projectRoutineWallClockOccurrence,
  projectTaskOccurrence,
  type PlannerProductTimePort,
  type PlannerReadProjectionInput,
  type RoutineWallClockPlannerOccurrence,
  createPlannerOwnerCommandRouter,
  defaultPlannerMutationTimePort,
  type PlannerMutationConflictReason,
  type PlannerMutationKind,
  type PlannerMutationOutcome,
  type PlannerMutationRequest,
  type PlannerMutationTimePort,
  type PlannerOwnerCommandDependencies,
  type PlannerOwnerCommandRouter,
  type RoutinePlannerOwnerCommandPort,
  applyPlannerOptimisticMutation,
  type PlannerOptimisticMutationInput,
  applyFullCalendarPlannerMutation,
  fullCalendarEventToPlannerRange,
  type PlannerFullCalendarMutationInfo,
} from './planner';
export {
  type PlannerProjectionSource,
  type PlannerProjectionSourcePresentation,
  plannerProjectionSourcePresentation,
  plannerProjectionSourceLabel,
  plannerProjectionToneClass,
  plannerProjectionKeyForUi,
  formatPlannerProjectionTimeRange,
  plannerProjectionDateKey,
  plannerSemanticI18nKey,
} from './planner/planner-presentation';
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

// Host composition lives on the `./host` subpath only (`ScheduleUiHost` and
// `bindScheduleUiHost` are not part of the root surface).
export type {
  FetchRoutineUpcomingCachedOptions,
  PanelSurfaceStatus,
  ScheduleGoalPort,
  ScheduleTaskPlannerPort,
} from './schedule-ui-host';
