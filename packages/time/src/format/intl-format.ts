import type { Instant, Ymd } from '@memoflow/shared-primitives';
import type { TimeContext, TimeDisplaySlot, TimePresentationStyle, TimeZoneId } from '../types';
import { isYmdShape } from '../codec/brand';
import { getZonedDateTimeParts } from '../timezone/wall-clock';

const FALLBACK_LOCALE = 'zh-CN';

type DateStyle = TimePresentationStyle['dateStyle'];
type TimeStyle = TimePresentationStyle['timeStyle'];

function utcDateAtNoon(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat(FALLBACK_LOCALE, options);
  }
}

function hourCycle(style: TimeStyle): 'h12' | 'h23' {
  return style === '12h' ? 'h12' : 'h23';
}

export function formatInstantHm(
  instant: Instant,
  context: TimeContext,
  presentation: TimePresentationStyle,
): string {
  return formatter(presentation.locale, {
    timeZone: context.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: hourCycle(presentation.timeStyle),
  }).format(new Date(instant));
}

export function formatInstantDate(
  instant: Instant,
  context: TimeContext,
  presentation: TimePresentationStyle,
): string {
  return formatter(presentation.locale, {
    timeZone: context.timeZone,
    dateStyle: presentation.dateStyle,
  }).format(new Date(instant));
}

export function formatInstantDateTime(
  instant: Instant,
  context: TimeContext,
  presentation: TimePresentationStyle,
): string {
  return formatter(presentation.locale, {
    timeZone: context.timeZone,
    dateStyle: presentation.dateStyle,
    timeStyle: 'short',
    hourCycle: hourCycle(presentation.timeStyle),
  }).format(new Date(instant));
}

/**
 * Locale-driven medium date for UI chrome that already owns its display locale.
 *
 * UI boundary adapter: keeps the host timezone and Intl's locale defaults so
 * existing component output stays byte-identical. Business/product time
 * formatting must use FormatApi with an explicit TimeContext.
 */
export function formatLocaleMediumDate(value: Instant | number | Date, locale: string): string {
  return formatter(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

/**
 * Locale-driven medium date + short time for UI chrome that already owns its
 * display locale. UI boundary adapter: keeps the host timezone and Intl's
 * locale-default hour cycle so existing component output stays byte-identical.
 */
export function formatLocaleMediumDateTime(value: Instant | number | Date, locale: string): string {
  return formatter(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Stable detail/export timestamp rendered in the requested product timezone. */
export function formatInstantDateTimeSeconds(instant: Instant, timeZone: TimeZoneId): string {
  const parts = getZonedDateTimeParts(instant, timeZone);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${two(parts.month)}-${two(parts.day)} ${two(parts.hour)}:${two(parts.minute)}:${two(parts.second)}`;
}

export function formatYmdForDisplay(
  ymd: Ymd | string,
  locale: string,
  dateStyle: DateStyle,
): string | null {
  if (!isYmdShape(ymd)) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  const instant = utcDateAtNoon(year, month, day);
  return formatter(locale, {
    timeZone: 'UTC',
    dateStyle,
  }).format(instant);
}

const SLOT_OPTIONS: Record<TimeDisplaySlot, Intl.DateTimeFormatOptions> = {
  periodDay: {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
  periodMonth: {
    year: 'numeric',
    month: 'long',
  },
  periodWeekDay: {
    weekday: 'long',
  },
  periodRangeDay: {
    month: 'short',
    day: 'numeric',
  },
  chartMonthDay: {
    month: 'short',
    day: 'numeric',
  },
  monthDayWeekday: {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  },
};

/** Named product display slots are semantic Intl presets, never persisted pattern tokens. */
export function formatInstantSlot(
  name: TimeDisplaySlot,
  instant: Instant,
  context: TimeContext,
  presentation: TimePresentationStyle,
): string {
  return formatter(presentation.locale, {
    ...SLOT_OPTIONS[name],
    timeZone: context.timeZone,
  }).format(new Date(instant));
}
