/**
 * DateFnsEngine — the **only** product surface that imports date-fns.
 * Business and UI code must use `@memoflow/time` facade, not date-fns directly.
 */
import {
  addDays as dfAddDays,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  endOfDay as dfEndOfDay,
  format as dfFormat,
  isSameDay as dfIsSameDay,
  isValid,
  startOfDay as dfStartOfDay,
  startOfWeek as dfStartOfWeek,
} from 'date-fns';
import { TZDateMini } from '@date-fns/tz';
import type { Hm, Instant, Ymd } from '@memoflow/contracts/primitives';
import type { TimeDateStyle, TimeEngine, TimeZoneId, Weekday } from '../types';
import { asHm, asInstant, asYmd, isHmShape, isYmdShape } from '../codec/brand';

function toDate(instant: Instant): Date {
  return new Date(instant);
}

/**
 * Date-fns fixed-pattern/chart/export escape hatch. TZDateMini is deliberately
 * kept inside the engine so date-fns receives the explicit context zone
 * without leaking @date-fns/tz into product contracts. The MemoFlow callers
 * currently use numeric date/time fields, `MMM d`, and `X`/`x` offsets; named
 * human presentation belongs to the Intl formatters instead.
 */
function toPatternDate(instant: Instant, timeZone: TimeZoneId): InstanceType<typeof TZDateMini> {
  return new TZDateMini(instant, timeZone);
}

function densityToDateFnsPattern(density: TimeDateStyle): string {
  switch (density) {
    case 'short':
      return 'yyyy/M/d';
    case 'long':
      return 'yyyy年M月d日 HH:mm';
    case 'medium':
    default:
      return 'yyyy-MM-dd HH:mm';
  }
}

function densityToDateOnlyPattern(density: TimeDateStyle): string {
  switch (density) {
    case 'short':
      return 'M/d';
    case 'long':
      return 'yyyy年M月d日';
    case 'medium':
    default:
      return 'yyyy-MM-dd';
  }
}

export function createDateFnsEngine(): TimeEngine {
  return {
    padTwoDigits(n: number): string {
      return String(Math.trunc(n)).padStart(2, '0');
    },

    formatHm(instant: Instant, pattern: string): string {
      const d = toDate(instant);
      if (!isValid(d)) return '';
      // Product default is HH:mm; honor common pattern tokens via date-fns.
      return dfFormat(d, pattern || 'HH:mm');
    },

    formatDate(instant: Instant, _locale: string, density: TimeDateStyle): string {
      const d = toDate(instant);
      if (!isValid(d)) return '';
      return dfFormat(d, densityToDateOnlyPattern(density));
    },

    formatDateTime(instant: Instant, _locale: string, density: TimeDateStyle): string {
      const d = toDate(instant);
      if (!isValid(d)) return '';
      return dfFormat(d, densityToDateFnsPattern(density));
    },

    formatPattern(instant: Instant, pattern: string, timeZone: TimeZoneId): string {
      const d = toPatternDate(instant, timeZone);
      if (!isValid(d)) return '';
      return dfFormat(d, pattern);
    },

    toYmd(instant: Instant): Ymd {
      const d = toDate(instant);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return asYmd(`${y}-${m}-${day}`);
    },

    fromYmdStart(ymd: Ymd): Instant {
      const [ys, ms, ds] = ymd.split('-');
      const y = Number(ys);
      const m = Number(ms);
      const d = Number(ds);
      return asInstant(new Date(y, m - 1, d, 0, 0, 0, 0).getTime());
    },

    parseYmd(raw: string): Ymd | null {
      if (!isYmdShape(raw)) return null;
      return asYmd(raw);
    },

    parseHm(raw: string): Hm | null {
      if (!isHmShape(raw)) return null;
      return asHm(raw);
    },

    combineYmdHm(ymd: Ymd, hm: Hm): Instant | null {
      if (!isYmdShape(ymd) || !isHmShape(hm)) return null;
      const [ys, ms, ds] = ymd.split('-');
      const [hs, mins] = hm.split(':');
      const instant = new Date(
        Number(ys),
        Number(ms) - 1,
        Number(ds),
        Number(hs),
        Number(mins),
        0,
        0,
      );
      if (!isValid(instant)) return null;
      return asInstant(instant.getTime());
    },

    startOfDay(instant: Instant): Instant {
      return asInstant(dfStartOfDay(toDate(instant)).getTime());
    },

    endOfDay(instant: Instant): Instant {
      return asInstant(dfEndOfDay(toDate(instant)).getTime());
    },

    addDays(instant: Instant, n: number): Instant {
      return asInstant(dfAddDays(toDate(instant), n).getTime());
    },

    diffCalendarDays(a: Instant, b: Instant): number {
      return differenceInCalendarDays(toDate(a), toDate(b));
    },

    diffCalendarWeeks(a: Instant, b: Instant, weekStartsOn: Weekday = 1): number {
      return differenceInCalendarWeeks(toDate(a), toDate(b), { weekStartsOn });
    },

    startOfWeek(instant: Instant, weekStartsOn: Weekday): Instant {
      return asInstant(dfStartOfWeek(toDate(instant), { weekStartsOn }).getTime());
    },

    isSameDay(a: Instant, b: Instant): boolean {
      return dfIsSameDay(toDate(a), toDate(b));
    },

    isValidInstant(instant: Instant | number): boolean {
      return (
        typeof instant === 'number' &&
        Number.isFinite(instant) &&
        isValid(toDate(instant as Instant))
      );
    },
  };
}
