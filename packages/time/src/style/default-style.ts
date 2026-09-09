import type {
  PartialTimePresentationStyle,
  PartialTimeStyle,
  TimePresentationStyle,
  TimeStyle,
} from '../types';

export const DEFAULT_TIME_PRESENTATION_STYLE: TimePresentationStyle = Object.freeze({
  locale: 'zh-CN',
  dateStyle: 'medium',
  timeStyle: '24h',
  empty: Object.freeze({
    display: '—',
    input: '',
    unknown: '—',
  }),
  relative: Object.freeze({
    enabled: true,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    numeric: 'auto',
  }),
  duration: Object.freeze({
    style: 'narrow',
    zero: '0m',
  }),
}) as TimePresentationStyle;

/** @deprecated Canonical callers use TimeContext + DEFAULT_TIME_PRESENTATION_STYLE. */
export const DEFAULT_TIME_STYLE: TimeStyle = Object.freeze({
  ...DEFAULT_TIME_PRESENTATION_STYLE,
  display: Object.freeze({
    date: 'medium',
    dateTime: 'medium',
    hm: 'HH:mm',
    periodDay: 'EEEE, yyyy MMMM d',
    periodMonth: 'yyyy MMMM',
    periodWeekDay: 'EEEE',
    chartMonthDay: 'MMM d',
  }),
  timeZone: 'local',
  calendar: Object.freeze({
    dayBoundary: 'local-midnight',
    weekStartsOn: 1,
  }),
}) as TimeStyle;

export function mergeTimePresentationStyle(
  base: TimePresentationStyle,
  partial?: PartialTimePresentationStyle | null,
): TimePresentationStyle {
  if (!partial) return base;
  return {
    locale: partial.locale ?? base.locale,
    dateStyle: partial.dateStyle ?? base.dateStyle,
    timeStyle: partial.timeStyle ?? base.timeStyle,
    empty: { ...base.empty, ...partial.empty },
    relative: { ...base.relative, ...partial.relative },
    duration: { ...base.duration, ...partial.duration },
  };
}

/** @deprecated Compatibility merge for legacy mixed TimeStyle consumers. */
function inferLegacyHourStyle(pattern: string | undefined): TimeStyle['timeStyle'] | undefined {
  if (pattern == null) return undefined;
  if (/(^|[^H])h/.test(pattern) || /a/.test(pattern)) return '12h';
  if (/H/.test(pattern)) return '24h';
  return undefined;
}

export function mergeTimeStyle(base: TimeStyle, partial?: PartialTimeStyle | null): TimeStyle {
  if (!partial) return base;
  const presentation = mergeTimePresentationStyle(base, {
    ...partial,
    dateStyle: partial.dateStyle ?? partial.display?.date ?? partial.display?.dateTime,
    timeStyle: partial.timeStyle ?? inferLegacyHourStyle(partial.display?.hm),
  });
  return {
    ...presentation,
    display: { ...base.display, ...partial.display },
    timeZone: partial.timeZone ?? base.timeZone,
    calendar: { ...base.calendar, ...partial.calendar },
  };
}
