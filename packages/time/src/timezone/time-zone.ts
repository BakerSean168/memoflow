import { requireTimeZoneId } from '@memoflow/contracts/primitives';
import type { TimeContext, TimeZoneId, Weekday } from '../types';

export {
  isIanaTimeZoneId,
  parseTimeZoneId,
  requireTimeZoneId,
} from '@memoflow/contracts/primitives';

/**
 * Explicit input source for the host/user IANA zone.
 * Recurrence code consumes a resolved IANA id rather than reading host state ad hoc.
 */
export interface TimeZoneSource {
  currentTimeZoneId(): TimeZoneId;
}

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Boundary constructor for canonical Product Time context. */
export function createTimeContext(input: {
  timeZone: string | TimeZoneId;
  weekStartsOn?: number;
}): TimeContext {
  const weekStartsOn = input.weekStartsOn ?? 1;
  if (!isWeekday(weekStartsOn)) {
    throw new TypeError(`Invalid weekStartsOn: ${String(weekStartsOn)}`);
  }
  return Object.freeze({
    timeZone: requireTimeZoneId(input.timeZone),
    weekStartsOn,
  });
}

export function createSystemTimeZoneSource(): TimeZoneSource {
  return {
    currentTimeZoneId(): TimeZoneId {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) {
        throw new TypeError(`Host did not provide a valid IANA time zone: ${String(zone)}`);
      }
      return requireTimeZoneId(zone);
    },
  };
}

export function createFixedTimeZoneSource(timeZoneId: TimeZoneId): TimeZoneSource {
  const validated = requireTimeZoneId(timeZoneId);
  return {
    currentTimeZoneId: () => validated,
  };
}
