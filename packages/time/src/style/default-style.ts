import type {
  PartialTimePresentationStyle,
  PartialTimeStyle,
  TimePresentationStyle,
  TimeStyle,
} from '../types';

export const DEFAULT_TIME_PRESENTATION_STYLE: TimePresentationStyle = Object.freeze({
  locale: 'zh-CN',
  empty: Object.freeze({
    display: '—',
    input: '',
    unknown: '—',
  }),
  display: Object.freeze({
    date: 'medium',
    dateTime: 'medium',
    hm: 'HH:mm',
    periodDay: 'EEEE, yyyy MMMM d',
    periodMonth: 'yyyy MMMM',
    periodWeekDay: 'EEEE',
    chartMonthDay: 'MMM d',
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
    empty: { ...base.empty, ...partial.empty },
    display: { ...base.display, ...partial.display },
    relative: { ...base.relative, ...partial.relative },
    duration: { ...base.duration, ...partial.duration },
  };
}

/** @deprecated Compatibility merge for legacy mixed TimeStyle consumers. */
export function mergeTimeStyle(base: TimeStyle, partial?: PartialTimeStyle | null): TimeStyle {
  if (!partial) return base;
  const presentation = mergeTimePresentationStyle(base, partial);
  return {
    ...presentation,
    timeZone: partial.timeZone ?? base.timeZone,
    calendar: { ...base.calendar, ...partial.calendar },
  };
}
