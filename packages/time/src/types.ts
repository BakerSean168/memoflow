import type { Hm, Instant, TransferDate, Ymd } from '@memoflow/contracts/primitives';

export type { Instant, TransferDate, Ymd, Hm };

/** Invalid input handling for Codec — never silently substitute Date.now(). */
export type OnInvalid = 'null' | 'throw';

export type LocaleId = string;

/** Sunday=0 ... Saturday=6. Shared by TimeContext and calendar policies. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

declare const timeZoneIdBrand: unique symbol;

/**
 * Validated IANA time-zone identifier.
 *
 * Runtime construction is owned by the timezone helpers; arbitrary string casts
 * are not a canonical creation path.
 */
export type TimeZoneId = string & { readonly [timeZoneIdBrand]: 'TimeZoneId' };

/**
 * Legacy compatibility input used by TimeStyle/Codec migration surfaces.
 * Canonical product state uses TimeContext.timeZone: TimeZoneId.
 *
 * @deprecated Prefer validated `TimeZoneId` inside `TimeContext`.
 */
export type TimeZonePolicy = 'local' | string;

/** Canonical product-time context affecting calendar/wall-clock semantics. */
export interface TimeContext {
  timeZone: TimeZoneId;
  weekStartsOn: Weekday;
}

export interface TimeStyleCalendar {
  dayBoundary: 'local-midnight';
  weekStartsOn: Weekday;
}

export interface TimeStyleEmpty {
  /** Empty / null display for list cells and format.* */
  display: string;
  /** Empty input control value */
  input: string;
  /** Unknown / unparseable display */
  unknown: string;
}

export type TimeDateStyle = 'short' | 'medium' | 'long';
export type TimeHourStyle = '12h' | '24h';

/** Legacy pre-vNext display/pattern bag. Canonical presentation uses dateStyle/timeStyle. */
export interface TimeStyleDisplay {
  date: TimeDateStyle;
  dateTime: TimeDateStyle;
  /** Pattern for format.hm — product default HH:mm */
  hm: string;
  /** Named calendar chrome slots (P6) — date-fns patterns */
  periodDay: string;
  periodMonth: string;
  periodWeekDay: string;
  chartMonthDay: string;
}

/** Named display slot keys for format.slot */
export type TimeDisplaySlot = 'periodDay' | 'periodMonth' | 'periodWeekDay' | 'chartMonthDay';

export interface TimeStyleRelative {
  enabled: boolean;
  /** Beyond this age, format.relative falls back to absolute dateTime */
  maxAgeMs: number;
  numeric: 'auto' | 'always';
}

export interface TimeStyleDuration {
  style: 'narrow' | 'long';
  zero: string;
}

/** Canonical presentation-only time preferences. */
export interface TimePresentationStyle {
  locale: LocaleId;
  dateStyle: TimeDateStyle;
  timeStyle: TimeHourStyle;
  empty: TimeStyleEmpty;
  relative: TimeStyleRelative;
  duration: TimeStyleDuration;
}

export type PartialTimePresentationStyle = {
  locale?: LocaleId;
  dateStyle?: TimeDateStyle;
  timeStyle?: TimeHourStyle;
  empty?: Partial<TimeStyleEmpty>;
  relative?: Partial<TimeStyleRelative>;
  duration?: Partial<TimeStyleDuration>;
};

/**
 * Legacy mixed presentation + calendar style.
 *
 * @deprecated Canonical callers use `TimeContext` + `TimePresentationStyle`.
 */
export interface TimeStyle extends TimePresentationStyle {
  /** @deprecated Legacy pattern bag; canonical presentation does not expose format tokens. */
  display: TimeStyleDisplay;
  timeZone: TimeZonePolicy;
  calendar: TimeStyleCalendar;
}

/** @deprecated Canonical callers use `TimeContext` + `PartialTimePresentationStyle`. */
export type PartialTimeStyle = PartialTimePresentationStyle & {
  display?: Partial<TimeStyleDisplay>;
  timeZone?: TimeZonePolicy;
  calendar?: Partial<TimeStyleCalendar>;
};

export interface Clock {
  now(): Instant;
}

export interface TimeEngine {
  formatHm(instant: Instant, pattern: string): string;
  formatDate(instant: Instant, locale: string, density: TimeStyleDisplay['date']): string;
  formatDateTime(instant: Instant, locale: string, density: TimeStyleDisplay['dateTime']): string;
  /** Registered fixed chart/export pattern (engine-only; prefer named format.*). */
  formatPattern(instant: Instant, pattern: string, timeZone: TimeZoneId): string;
  toYmd(instant: Instant): Ymd;
  fromYmdStart(ymd: Ymd): Instant;
  parseYmd(raw: string): Ymd | null;
  parseHm(raw: string): Hm | null;
  combineYmdHm(ymd: Ymd, hm: Hm): Instant | null;
  startOfDay(instant: Instant): Instant;
  endOfDay(instant: Instant): Instant;
  addDays(instant: Instant, n: number): Instant;
  diffCalendarDays(a: Instant, b: Instant): number;
  diffCalendarWeeks(a: Instant, b: Instant, weekStartsOn?: Weekday): number;
  startOfWeek(instant: Instant, weekStartsOn: Weekday): Instant;
  isSameDay(a: Instant, b: Instant): boolean;
  isValidInstant(instant: Instant | number): boolean;
  padTwoDigits(n: number): string;
}
