import type { TimeContext, TimePresentationStyle, TimeStyle, TimeZonePolicy } from '../types';
import {
  createSystemTimeZoneSource,
  createTimeContext,
  resolveTimeZoneId,
  type TimeZoneSource,
} from '../timezone/time-zone';

/** Explicit bounded adapter for the pre-vNext mixed TimeStyle contract. */
export function adaptLegacyTimeStyle(
  style: TimeStyle,
  timeZoneSource: TimeZoneSource = createSystemTimeZoneSource(),
): { context: TimeContext; presentation: TimePresentationStyle } {
  return {
    context: createTimeContext({
      timeZone: resolveTimeZoneId(style.timeZone, timeZoneSource),
      weekStartsOn: style.calendar.weekStartsOn,
    }),
    presentation: {
      locale: style.locale,
      dateStyle: style.dateStyle,
      timeStyle: style.timeStyle,
      empty: { ...style.empty },
      relative: { ...style.relative },
      duration: { ...style.duration },
    },
  };
}

/**
 * Projects the canonical split back to legacy TimeStyle for compatibility-only
 * consumers while migrations are in progress.
 */
export function composeLegacyTimeStyle(
  context: TimeContext,
  presentation: TimePresentationStyle,
  options?: {
    timeZonePolicy?: TimeZonePolicy;
    dayBoundary?: TimeStyle['calendar']['dayBoundary'];
  },
): TimeStyle {
  return {
    ...presentation,
    display: {
      date: presentation.dateStyle,
      dateTime: presentation.dateStyle,
      hm: presentation.timeStyle === '12h' ? 'h:mm a' : 'HH:mm',
      periodDay: 'EEEE, yyyy MMMM d',
      periodMonth: 'yyyy MMMM',
      periodWeekDay: 'EEEE',
      chartMonthDay: 'MMM d',
    },
    timeZone: options?.timeZonePolicy ?? context.timeZone,
    calendar: {
      dayBoundary: options?.dayBoundary ?? 'local-midnight',
      weekStartsOn: context.weekStartsOn,
    },
  };
}
