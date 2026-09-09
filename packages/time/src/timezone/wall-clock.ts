import type { Hm, Instant, Ymd } from '@memoflow/contracts/primitives';
import type { TimeContext, TimeZoneId, Weekday } from '../types';
import { asHm, asInstant, asYmd, isHmShape, isYmdShape } from '../codec/brand';

const DAY_MS = 86_400_000;

/** Product policy for wall-clock times that are not one-to-one during DST transitions. */
export const WALL_CLOCK_RESOLUTION_POLICY = Object.freeze({
  nonexistent: 'shift-forward',
  ambiguous: 'earlier',
} as const);

export type WallClockResolutionPolicy = typeof WALL_CLOCK_RESOLUTION_POLICY;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = formatterCache.get(timeZone);
  if (existing != null) return existing;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedParts(instantMs: number, timeZone: string): ZonedParts | null {
  try {
    const bag: Record<string, string> = {};
    for (const part of getFormatter(timeZone).formatToParts(new Date(instantMs))) {
      if (part.type !== 'literal') bag[part.type] = part.value;
    }

    const year = Number(bag.year);
    const month = Number(bag.month);
    const day = Number(bag.day);
    const hour = Number(bag.hour);
    const minute = Number(bag.minute);
    const second = Number(bag.second);
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond: new Date(instantMs).getUTCMilliseconds(),
    };
  } catch {
    return null;
  }
}

function parseYmdParts(ymd: Ymd): { year: number; month: number; day: number } | null {
  if (!isYmdShape(ymd)) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return { year, month, day };
}

function ymdFromParts(year: number, month: number, day: number): Ymd {
  return asYmd(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

function ymdOrdinal(ymd: Ymd): number {
  const parts = parseYmdParts(ymd);
  if (parts == null) throw new TypeError(`Invalid Ymd: ${String(ymd)}`);
  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

/** Add calendar days to a Ymd without consulting host-local time. */
export function addYmdDays(ymd: Ymd, amount: number): Ymd {
  const parts = parseYmdParts(ymd);
  if (parts == null || !Number.isFinite(amount)) {
    throw new TypeError(`Cannot add calendar days to Ymd=${String(ymd)} amount=${String(amount)}`);
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Math.trunc(amount)));
  return ymdFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function resolveWallClockParts(parts: ZonedParts, timeZone: string): Instant | null {
  const desiredUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  // Start from the wall components interpreted as UTC and iteratively correct by
  // the zone offset observed through Intl. This deterministically yields the
  // earlier occurrence for overlaps and shift-forward behavior for gaps.
  let guess = desiredUtc;
  for (let index = 0; index < 3; index += 1) {
    const observed = getZonedParts(guess, timeZone);
    if (observed == null) return null;
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      observed.millisecond,
    );
    const delta = desiredUtc - observedAsUtc;
    if (delta === 0) break;
    guess += delta;
  }

  return asInstant(guess);
}

/** Canonical Ymd+Hm -> Instant resolver. Policy: DST gap shifts forward; overlap chooses earlier. */
export function combineYmdHmWithTimeZone(ymd: Ymd, hm: Hm, timeZone: string): Instant | null {
  if (!isYmdShape(ymd) || !isHmShape(hm)) return null;
  const date = parseYmdParts(ymd);
  if (date == null) return null;
  const [hour, minute] = hm.split(':').map(Number);
  if (![hour, minute].every(Number.isFinite)) return null;

  return resolveWallClockParts(
    {
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    timeZone,
  );
}

/** Convert an Instant into its calendar Ymd in the requested IANA zone. */
export function instantToYmdInTimeZone(instant: Instant, timeZone: TimeZoneId): Ymd {
  const parts = getZonedParts(instant, timeZone);
  if (parts == null) throw new TypeError(`Unable to resolve Instant in timeZone=${timeZone}`);
  return ymdFromParts(parts.year, parts.month, parts.day);
}

/** Convert an Instant into HH:mm in the requested IANA zone. */
export function instantToHmInTimeZone(instant: Instant, timeZone: TimeZoneId): Hm {
  const parts = getZonedParts(instant, timeZone);
  if (parts == null) throw new TypeError(`Unable to resolve Instant in timeZone=${timeZone}`);
  return asHm(`${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`);
}

/** Start of the local calendar day containing the Instant. */
export function startOfDayInContext(instant: Instant, context: TimeContext): Instant {
  return startOfYmdInTimeZone(instantToYmdInTimeZone(instant, context.timeZone), context.timeZone);
}

/** End of the local calendar day containing the Instant, including DST-short/long days. */
export function endOfDayInContext(instant: Instant, context: TimeContext): Instant {
  const current = instantToYmdInTimeZone(instant, context.timeZone);
  const next = startOfYmdInTimeZone(addYmdDays(current, 1), context.timeZone);
  return asInstant(next - 1);
}

/** Resolve local midnight for a Ymd in an IANA zone. */
export function startOfYmdInTimeZone(ymd: Ymd, timeZone: TimeZoneId): Instant {
  const resolved = combineYmdHmWithTimeZone(ymd, asHm('00:00'), timeZone);
  if (resolved == null) throw new TypeError(`Unable to resolve start of Ymd=${ymd} in ${timeZone}`);
  return resolved;
}

/** Add calendar days while preserving the local wall-clock time in TimeContext. */
export function addCalendarDaysInContext(
  instant: Instant,
  amount: number,
  context: TimeContext,
): Instant {
  if (!Number.isFinite(amount))
    throw new TypeError(`Invalid calendar day amount: ${String(amount)}`);
  const current = getZonedParts(instant, context.timeZone);
  if (current == null)
    throw new TypeError(`Unable to resolve Instant in timeZone=${context.timeZone}`);
  const target = parseYmdParts(
    addYmdDays(ymdFromParts(current.year, current.month, current.day), Math.trunc(amount)),
  );
  if (target == null) throw new TypeError('Unable to resolve target calendar day');

  const resolved = resolveWallClockParts(
    {
      ...current,
      year: target.year,
      month: target.month,
      day: target.day,
    },
    context.timeZone,
  );
  if (resolved == null) {
    throw new TypeError(`Unable to add calendar days in timeZone=${context.timeZone}`);
  }
  return resolved;
}

/** differenceInCalendarDays semantics (left minus right) under TimeContext. */
export function diffCalendarDaysInContext(a: Instant, b: Instant, context: TimeContext): number {
  return (
    ymdOrdinal(instantToYmdInTimeZone(a, context.timeZone)) -
    ymdOrdinal(instantToYmdInTimeZone(b, context.timeZone))
  );
}

function startOfWeekYmd(ymd: Ymd, weekStartsOn: Weekday): Ymd {
  const parts = parseYmdParts(ymd);
  if (parts == null) throw new TypeError(`Invalid Ymd: ${String(ymd)}`);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const delta = (weekday - weekStartsOn + 7) % 7;
  return addYmdDays(ymd, -delta);
}

/** Start of the local calendar week containing the Instant. */
export function startOfWeekInContext(instant: Instant, context: TimeContext): Instant {
  const ymd = instantToYmdInTimeZone(instant, context.timeZone);
  return startOfYmdInTimeZone(startOfWeekYmd(ymd, context.weekStartsOn), context.timeZone);
}

/** differenceInCalendarWeeks semantics (left minus right) under TimeContext. */
export function diffCalendarWeeksInContext(a: Instant, b: Instant, context: TimeContext): number {
  const left = startOfWeekYmd(instantToYmdInTimeZone(a, context.timeZone), context.weekStartsOn);
  const right = startOfWeekYmd(instantToYmdInTimeZone(b, context.timeZone), context.weekStartsOn);
  return Math.trunc((ymdOrdinal(left) - ymdOrdinal(right)) / 7);
}

export function isSameDayInContext(a: Instant, b: Instant, context: TimeContext): boolean {
  return (
    instantToYmdInTimeZone(a, context.timeZone) === instantToYmdInTimeZone(b, context.timeZone)
  );
}
