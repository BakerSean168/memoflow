import { z } from 'zod';

/** Validated IANA time-zone identifier used by portable Product Time contracts. */
export type TimeZoneId = string & { readonly __brand: 'TimeZoneId' };

/**
 * Returns true only for identifiers accepted by the host's IANA time-zone
 * database. `local` is intentionally not a portable time-zone identifier.
 */
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

/** Strict boundary schema for the portable IANA time-zone primitive. */
export const TimeZoneIdSchema = z.string().refine(isIanaTimeZoneId, {
  message: 'Invalid IANA time zone',
}) as unknown as z.ZodType<TimeZoneId>;
