import { requireYmd } from '@memoflow/shared-primitives';
import { ymdToCalendarDateValue } from '@memoflow/time';

/** Canonical Ymd -> third-party CalendarDate boundary. */
export function parseToCalendarDate(dateStr: string) {
  if (!dateStr) return undefined;
  return ymdToCalendarDateValue(requireYmd(dateStr));
}
