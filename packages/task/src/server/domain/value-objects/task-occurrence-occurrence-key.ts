import { createTimeFacade, type TimeContext } from '@memoflow/time';

/**
 * TaskOccurrence occurrence key (R2-1 / P0-03).
 *
 * Deterministic idempotency key: `{templateId}:{calendarDate}`. The calendar
 * date is always resolved from an explicit Product Time context; server host
 * timezone is never a business input.
 */
export function startOfLocalDay(value: number, timeContext: TimeContext): number {
  return createTimeFacade({ context: timeContext }).calendar.startOfDay(value);
}

/** Context-scoped YYYY-MM-DD (never ambient host-local). */
export function toLocalDateKey(dayStartMs: number, timeContext: TimeContext): string {
  return createTimeFacade({ context: timeContext }).calendar.toYmd(dayStartMs);
}

export function buildTaskOccurrenceOccurrenceKey(
  templateId: string,
  instanceDate: number,
  timeContext: TimeContext,
): string {
  return `${templateId}:${toLocalDateKey(startOfLocalDay(instanceDate, timeContext), timeContext)}`;
}
