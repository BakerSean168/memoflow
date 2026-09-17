import type { Instant, Ymd } from '../../primitives';

export type PlannerSourceType = 'schedule' | 'task' | 'goal' | 'routine';

/** Whether a Planner projection actually consumes time for conflict purposes. */
export type PlannerOccupancy = 'blocking' | 'non-blocking' | 'marker';

export type PlannerDisplaySemantic =
  'calendar-entry' | 'task-occurrence' | 'goal-start' | 'goal-target' | 'routine-wall-clock';

export type PlannerDisplayTone = 'default' | 'muted' | 'accent' | 'warning' | 'success';

export interface PlannerDisplayMetadata {
  readonly semantic: PlannerDisplaySemantic;
  readonly subtitle?: string | null;
  readonly tone?: PlannerDisplayTone;
  readonly status?: string | null;
}

export interface PlannerEditableCapabilities {
  readonly move: boolean;
  readonly resize: boolean;
}

export type PlannerOwnerCommandTarget =
  | { readonly ownerType: 'schedule.calendar-entry'; readonly ownerId: string }
  | { readonly ownerType: 'task.occurrence'; readonly ownerId: string }
  | { readonly ownerType: 'goal.goal'; readonly ownerId: string }
  | { readonly ownerType: 'routine.routine'; readonly ownerId: string };

export interface PlannerTimedRange {
  readonly allDay: false;
  readonly start: Instant;
  readonly end: Instant | null;
}

export interface PlannerAllDayRange {
  readonly allDay: true;
  readonly start: Ymd;
  readonly end: Ymd | null;
}

export type PlannerEventRange = PlannerTimedRange | PlannerAllDayRange;

interface CalendarEventProjectionBase<
  TSource extends PlannerSourceType,
  TTarget extends PlannerOwnerCommandTarget,
> {
  /** Authenticated owner scope of the source read model. Never use this as command authorization input. */
  readonly identityId: string;
  readonly sourceType: TSource;
  /** Stable identity of the projected fact, not of any Scheduler invocation. */
  readonly sourceId: string;
  readonly title: string;
  /** Derived Planner occupancy policy; never persisted back into the owner domain. */
  readonly occupancy: PlannerOccupancy;
  readonly displayMetadata: PlannerDisplayMetadata;
  readonly editableCapabilities: PlannerEditableCapabilities;
  readonly ownerCommandTarget: TTarget;
  readonly revision: number;
}

type CalendarEventProjectionFor<
  TSource extends PlannerSourceType,
  TTarget extends PlannerOwnerCommandTarget,
> = CalendarEventProjectionBase<TSource, TTarget> & PlannerEventRange;

export type ScheduleCalendarEventProjection = CalendarEventProjectionFor<
  'schedule',
  Extract<PlannerOwnerCommandTarget, { ownerType: 'schedule.calendar-entry' }>
>;

export type TaskCalendarEventProjection = CalendarEventProjectionFor<
  'task',
  Extract<PlannerOwnerCommandTarget, { ownerType: 'task.occurrence' }>
>;

export type GoalCalendarEventProjection = CalendarEventProjectionFor<
  'goal',
  Extract<PlannerOwnerCommandTarget, { ownerType: 'goal.goal' }>
>;

export type RoutineCalendarEventProjection = CalendarEventProjectionFor<
  'routine',
  Extract<PlannerOwnerCommandTarget, { ownerType: 'routine.routine' }>
>;

/**
 * Canonical Planner read contract (ADR-060 / PLAN-4302).
 *
 * This is deliberately a projection of owner-domain facts. ScheduleTask,
 * ScheduledInvocationContext, retry/lease/dead-letter state and handler keys are
 * not valid inputs or fields of this contract.
 */
export type CalendarEventProjection =
  | ScheduleCalendarEventProjection
  | TaskCalendarEventProjection
  | GoalCalendarEventProjection
  | RoutineCalendarEventProjection;


export interface PlannerProjectionRef {
  readonly sourceType: PlannerSourceType;
  readonly sourceId: string;
}

export interface PlannerConflictSuggestion {
  /** Owner fact that would be changed if a future product flow accepts this suggestion. */
  readonly target: PlannerProjectionRef;
  readonly kind: 'move-earlier' | 'move-later';
  readonly range: { readonly kind: 'Timed'; readonly start: Instant; readonly end: Instant };
}

/**
 * Pure Planner read-model conflict. It is recomputed from owner projections and
 * is never persisted as CalendarEntry/Task/Goal/Routine truth.
 */
export interface PlannerConflictProjection {
  readonly id: string;
  readonly identityId: string;
  readonly left: PlannerProjectionRef;
  readonly right: PlannerProjectionRef;
  readonly overlapRange: { readonly kind: 'Timed'; readonly start: Instant; readonly end: Instant };
  readonly overlapDurationMs: number;
  readonly severity: 'Minor' | 'Moderate' | 'Severe';
  readonly suggestions: readonly PlannerConflictSuggestion[];
}
