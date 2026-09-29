import type { CalendarEventProjection, PlannerDisplaySemantic } from '@memoflow/contracts/schedule';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';

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
