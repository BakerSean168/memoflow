import type { Ymd } from '@memoflow/contracts/primitives';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

/** Canonical deterministic occurrence identity: `{planId}:{scheduleDate}`. */
export function buildTaskOccurrenceOccurrenceKeyFromDate(
  planId: string,
  scheduleDate: Ymd,
): string {
  return `${planId}:${scheduleDate}`;
}

/** Explicit-context compatibility helper for pre-TASK-7306 callers. */
export function startOfLocalDay(value: number, timeContext: TimeContext): number {
  return createTimeFacade({ context: timeContext }).calendar.startOfDay(value);
}

/** Context-scoped YYYY-MM-DD (never ambient host-local). */
export function toLocalDateKey(dayStartMs: number, timeContext: TimeContext): Ymd {
  return createTimeFacade({ context: timeContext }).calendar.toYmd(dayStartMs);
}

export function buildTaskOccurrenceOccurrenceKey(
  planId: string,
  occurrenceDate: number,
  timeContext: TimeContext,
): string {
  return buildTaskOccurrenceOccurrenceKeyFromDate(
    planId,
    toLocalDateKey(startOfLocalDay(occurrenceDate, timeContext), timeContext),
  );
}
