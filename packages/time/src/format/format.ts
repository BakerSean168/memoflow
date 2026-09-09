import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import type {
  Clock,
  PartialTimePresentationStyle,
  TimeContext,
  TimeDisplaySlot,
  TimeEngine,
  TimePresentationStyle,
} from '../types';
import { mergeTimePresentationStyle } from '../style/default-style';
import { asInstant, isFiniteInstantMs } from '../codec/brand';
import { instantToYmdInTimeZone } from '../timezone/wall-clock';
import {
  formatInstantDate,
  formatInstantDateTime,
  formatInstantDateTimeSeconds,
  formatInstantHm,
  formatInstantSlot,
  formatYmdForDisplay,
} from './intl-format';
import {
  splitDurationMs,
  splitDurationMinutes,
  formatDurationParts,
  type DurationParts,
} from './duration';

export interface FormatApi {
  hm(
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  date(
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  dateTime(
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  /** Stable `yyyy-MM-dd HH:mm:ss` rendered in TimeContext.timeZone. */
  dateTimeSeconds(
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  ymdDisplay(
    ymd: Ymd | string | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  relative(
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  /**
   * Fixed chart/export escape hatch using the registered date-fns token patterns.
   * Current callers use numeric date/time fields, `MMM d`, and explicit `X`/`x`
   * offsets. Ordinary product UI must prefer semantic hm/date/dateTime/slot
   * formatters; this is not a locale or named-timezone presentation API.
   */
  pattern(
    instant: Instant | number | null | undefined,
    pattern: string,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  /** Named semantic calendar chrome slot rendered through Intl. */
  slot(
    name: TimeDisplaySlot,
    instant: Instant | number | null | undefined,
    styleOverride?: PartialTimePresentationStyle,
  ): string;
  durationMs(
    ms: number | null | undefined,
    options?: {
      labels?: {
        hours?: (n: number) => string;
        minutes?: (n: number) => string;
        seconds?: (n: number) => string;
        join?: string;
      };
      styleOverride?: PartialTimePresentationStyle;
    },
  ): string;
  durationMinutes(
    minutes: number | null | undefined,
    options?: {
      labels?: {
        hours?: (n: number) => string;
        minutes?: (n: number) => string;
        join?: string;
      };
      styleOverride?: PartialTimePresentationStyle;
    },
  ): string;
  splitDurationMs(ms: number): DurationParts;
  splitDurationMinutes(totalMinutes: number): DurationParts;
  /** @deprecated TIME-1206: use hm() through an explicit facade. */
  localHHmm(ms: number | null | undefined, styleOverride?: PartialTimePresentationStyle): string;
  /** @deprecated TIME-1206: JS Date is a boundary type; prefer Codec + Ymd. */
  dateToYmd(date: Date | null | undefined, styleOverride?: PartialTimePresentationStyle): string;
  hhmmParts(hour: number, minute: number): string;
  hourLabel(hour: number): string;
  padTwoDigits(n: number): string;
}

function resolveStyle(
  base: TimePresentationStyle,
  override?: PartialTimePresentationStyle,
): TimePresentationStyle {
  return mergeTimePresentationStyle(base, override);
}

function emptyOr(value: Instant | number | null | undefined): Instant | null {
  if (value == null || !isFiniteInstantMs(value)) return null;
  return value as Instant;
}

function formatInstantOrEmpty(
  value: Instant | null,
  empty: string,
  format: (instant: Instant) => string,
): string {
  if (value == null) return empty;
  // Preserve the engine's existing empty-string result for finite values
  // outside JavaScript Date's representable range.
  if (Number.isNaN(new Date(value).getTime())) return '';
  return format(value);
}

export function createFormat(
  presentation: TimePresentationStyle,
  context: TimeContext,
  engine: TimeEngine,
  clock: Clock,
): FormatApi {
  return {
    hm(instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        formatInstantHm(value, context, style),
      );
    },

    date(instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        formatInstantDate(value, context, style),
      );
    },

    dateTime(instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        formatInstantDateTime(value, context, style),
      );
    },

    dateTimeSeconds(instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        formatInstantDateTimeSeconds(value, context.timeZone),
      );
    },

    pattern(instant, pattern, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        engine.formatPattern(value, pattern, context.timeZone),
      );
    },

    slot(name, instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      return formatInstantOrEmpty(emptyOr(instant), style.empty.display, (value) =>
        formatInstantSlot(name, value, context, style),
      );
    },

    durationMs(ms, options) {
      const style = resolveStyle(presentation, options?.styleOverride);
      if (ms == null || !Number.isFinite(ms)) return style.duration.zero;
      return formatDurationParts(splitDurationMs(ms), style, options?.labels);
    },

    durationMinutes(minutes, options) {
      const style = resolveStyle(presentation, options?.styleOverride);
      if (minutes == null || !Number.isFinite(minutes)) return style.duration.zero;
      return formatDurationParts(splitDurationMinutes(minutes), style, options?.labels);
    },

    splitDurationMs(ms) {
      return splitDurationMs(ms);
    },

    splitDurationMinutes(totalMinutes) {
      return splitDurationMinutes(totalMinutes);
    },

    ymdDisplay(ymd, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      if (ymd == null || ymd === '') return style.empty.display;
      return formatYmdForDisplay(ymd, style.locale, style.dateStyle) ?? style.empty.unknown;
    },

    relative(instant, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      const value = emptyOr(instant);
      if (value == null) return style.empty.display;
      if (Number.isNaN(new Date(value).getTime())) return '';
      if (!style.relative.enabled) return formatInstantDateTime(value, context, style);

      const delta = clock.now() - value;
      if (Math.abs(delta) > style.relative.maxAgeMs) {
        return formatInstantDateTime(value, context, style);
      }

      try {
        const rtf = new Intl.RelativeTimeFormat(style.locale, {
          numeric: style.relative.numeric,
        });
        const abs = Math.abs(delta);
        if (abs < 60_000) return rtf.format(-Math.round(delta / 1000), 'second');
        if (abs < 3_600_000) return rtf.format(-Math.round(delta / 60_000), 'minute');
        if (abs < 86_400_000) return rtf.format(-Math.round(delta / 3_600_000), 'hour');
        return rtf.format(-Math.round(delta / 86_400_000), 'day');
      } catch {
        return formatInstantDateTime(value, context, style);
      }
    },

    localHHmm(ms, styleOverride) {
      return this.hm(ms, styleOverride);
    },

    dateToYmd(date, styleOverride) {
      const style = resolveStyle(presentation, styleOverride);
      if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
        return style.empty.input;
      }
      return instantToYmdInTimeZone(asInstant(date.getTime()), context.timeZone);
    },

    hhmmParts(hour, minute) {
      return `${engine.padTwoDigits(hour)}:${engine.padTwoDigits(minute)}`;
    },

    hourLabel(hour) {
      return `${engine.padTwoDigits(hour)}:00`;
    },

    padTwoDigits(n) {
      return engine.padTwoDigits(n);
    },
  };
}
