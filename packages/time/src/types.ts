import type {
  Hm,
  IdentityId,
  Instant,
  TimeZoneId,
  TransferDate,
  Ymd,
} from '@memoflow/contracts/primitives';

export type { Instant, TimeZoneId, TransferDate, Ymd, Hm };

/** Invalid input handling for Codec — never silently substitute Date.now(). */
export type OnInvalid = 'null' | 'throw';

export type LocaleId = string;

/** Sunday=0 ... Saturday=6. Shared by TimeContext and calendar policies. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Canonical product-time context affecting calendar/wall-clock semantics. */
export interface TimeContext {
  timeZone: TimeZoneId;
  weekStartsOn: Weekday;
}

/** Identity-scoped product-time context consumed by server/application owners. */
export type UserTimeContext = TimeContext;

/**
 * Canonical identity -> Product Time seam. Implementations live outside Time
 * (for example Preferences); business owners depend only on this port.
 */
export interface UserTimeContextPort {
  getUserTimeContext(identityId: IdentityId | string): Promise<UserTimeContext>;
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

export interface Clock {
  now(): Instant;
}

export interface TimeEngine {
  formatHm(instant: Instant, pattern: string): string;
  formatDate(instant: Instant, locale: string, density: TimeDateStyle): string;
  formatDateTime(instant: Instant, locale: string, density: TimeDateStyle): string;
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
