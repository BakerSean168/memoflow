import { formatYmdForDisplay } from '../format/intl-format';

/** Pure string helper; no clock, locale, or timezone dependency. */
export function padTwoDigits(n: number): string {
  return String(Math.trunc(n)).padStart(2, '0');
}

/** Pure minute-of-day presentation helper. */
export function formatHHmmParts(hour: number, minute: number): string {
  return `${padTwoDigits(hour)}:${padTwoDigits(minute)}`;
}

/** Pure hour label helper. */
export function formatHour(hour: number): string {
  return `${padTwoDigits(hour)}:00`;
}

/** Date-only Ymd display; no Instant/timezone interpretation occurs. */
export function formatDisplayDate(dateStr: string, locale: string): string {
  if (!dateStr) return '';
  return formatYmdForDisplay(dateStr, locale, 'medium') ?? '';
}
