import type { TimeContext, TimeZoneId, TimeZonePolicy, Weekday } from '../types';

/**
 * Explicit input source for the host/user IANA zone.
 * Recurrence code consumes a resolved IANA id rather than reading host state ad hoc.
 */
export interface TimeZoneSource {
  currentTimeZoneId(): TimeZoneId;
}

export function isIanaTimeZoneId(value: string): value is TimeZoneId {
  if (value.length === 0 || value === 'local') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Parses an untrusted string into the canonical branded time-zone id. */
export function parseTimeZoneId(value: string): TimeZoneId | null {
  return isIanaTimeZoneId(value) ? value : null;
}

/** Validates and returns the canonical branded time-zone id. */
export function requireTimeZoneId(value: string): TimeZoneId {
  const parsed = parseTimeZoneId(value);
  if (parsed == null) throw new TypeError(`Invalid IANA time zone: ${value}`);
  return parsed;
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

const systemTimeZoneSource = createSystemTimeZoneSource();

/** Resolves the legacy `local | string` policy into canonical branded state. */
export function resolveTimeZoneId(
  policy: TimeZonePolicy,
  source: TimeZoneSource = systemTimeZoneSource,
): TimeZoneId {
  const zone = policy === 'local' ? source.currentTimeZoneId() : policy;
  return requireTimeZoneId(zone);
}
