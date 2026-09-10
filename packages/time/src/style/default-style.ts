import type { PartialTimePresentationStyle, TimePresentationStyle } from '../types';

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
