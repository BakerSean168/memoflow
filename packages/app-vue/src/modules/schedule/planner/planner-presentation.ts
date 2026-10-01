import type { CalendarEventProjection, PlannerDisplaySemantic } from '@memoflow/contracts/schedule';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';

export type PlannerProjectionSource = CalendarEventProjection['sourceType'];

export interface PlannerProjectionSourcePresentation {
  readonly labelI18nKey: string;
  readonly sourceClass: string;
  readonly dotClass: string;
  readonly badgeClass: string;
  readonly calendarColor: string;
  readonly calendarForeground: string;
}

/**
 * Schedule-owned presentation authority for owner projections.
 *
 * Keep source identity styling here so Day/Week/Month/event-detail/capsule
 * surfaces cannot drift into different meanings for the same owner. Business
 * actions deliberately stay with their owner modules.
 */
export const plannerProjectionSourcePresentation: Record<
  PlannerProjectionSource,
  PlannerProjectionSourcePresentation
> = {
  schedule: {
    labelI18nKey: 'schedule.source.schedule',
    sourceClass: 'planner-source-schedule',
    dotClass: 'bg-primary',
    badgeClass: 'bg-primary/10 text-primary',
    calendarColor: 'var(--primary)',
    calendarForeground: 'var(--primary-foreground)',
  },
  task: {
    labelI18nKey: 'schedule.source.task',
    sourceClass: 'planner-source-task',
    dotClass: 'bg-info',
    badgeClass: 'bg-info/15 text-info',
    calendarColor: 'var(--info)',
    calendarForeground: 'var(--info-foreground)',
  },
  goal: {
    labelI18nKey: 'schedule.source.goal',
    sourceClass: 'planner-source-goal',
    dotClass: 'bg-warning',
    badgeClass: 'bg-warning/15 text-warning',
    calendarColor: 'var(--warning)',
    calendarForeground: 'var(--warning-foreground)',
  },
  routine: {
    labelI18nKey: 'schedule.source.routine',
    sourceClass: 'planner-source-routine',
    dotClass: 'bg-success',
    badgeClass: 'bg-success/15 text-success',
    calendarColor: 'var(--success)',
    calendarForeground: 'var(--success-foreground)',
  },
};

export function plannerProjectionSourceLabel(
  source: PlannerProjectionSource,
  translate: (key: string) => string,
): string {
  return translate(plannerProjectionSourcePresentation[source].labelI18nKey);
}

export function plannerProjectionToneClass(
  projection: CalendarEventProjection,
  hasConflict = false,
): string {
  if (hasConflict) return 'planner-tone-warning';
  return `planner-tone-${projection.displayMetadata.tone ?? 'default'}`;
}

export function plannerProjectionKeyForUi(projection: CalendarEventProjection): string {
  return `${projection.sourceType}:${projection.sourceId}`;
}

export function formatPlannerProjectionTimeRange(
  projection: CalendarEventProjection,
  allDayLabel: string,
): string {
  void productTimeRevision.value;
  const time = getProductTime();

  if (projection.allDay) {
    const start = time.format.ymdDisplay(projection.start);
    if (projection.end == null || projection.end === projection.start) {
      return `${start} · ${allDayLabel}`;
    }
    return `${start} – ${time.format.ymdDisplay(projection.end)} · ${allDayLabel}`;
  }

  const start = time.format.pattern(Number(projection.start), 'MMM d HH:mm');
  if (projection.end == null) return start;
  const end = time.format.pattern(Number(projection.end), 'MMM d HH:mm');
  return `${start} – ${end}`;
}

export function plannerProjectionDateKey(projection: CalendarEventProjection): string {
  void productTimeRevision.value;
  if (projection.allDay) return String(projection.start);
  return String(getProductTime().calendar.toYmd(Number(projection.start)));
}

export const plannerSemanticI18nKey: Record<PlannerDisplaySemantic, string> = {
  'calendar-entry': 'schedule.eventDetail.semantic.calendarEntry',
  'task-occurrence': 'schedule.eventDetail.semantic.taskOccurrence',
  'goal-start': 'schedule.eventDetail.semantic.goalStart',
  'goal-target': 'schedule.eventDetail.semantic.goalTarget',
  'routine-wall-clock': 'schedule.eventDetail.semantic.routineWallClock',
};
