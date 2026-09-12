import type { Instant, Ymd } from '../../primitives';

export type PlannerSourceType = 'schedule' | 'task' | 'goal' | 'routine';

export type PlannerDisplaySemantic =
  'calendar-entry' | 'task-occurrence' | 'goal-start' | 'goal-target' | 'routine-wall-clock';

export type PlannerDisplayTone = 'default' | 'muted' | 'accent' | 'warning' | 'success';

export interface PlannerDisplayMetadata {
  readonly semantic: PlannerDisplaySemantic;
  readonly subtitle?: string | null;
  readonly tone?: PlannerDisplayTone;
  readonly status?: string | null;
  readonly hasConflict?: boolean;
}

export interface PlannerEditableCapabilities {
  readonly move: boolean;
  readonly resize: boolean;
}

export type PlannerOwnerCommandTarget =
  | { readonly ownerType: 'schedule.calendar-entry'; readonly ownerId: string }
  | { readonly ownerType: 'task.instance'; readonly ownerId: string }
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
  Extract<PlannerOwnerCommandTarget, { ownerType: 'task.instance' }>
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
