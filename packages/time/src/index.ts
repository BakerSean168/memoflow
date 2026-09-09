/**
 * @memoflow/time — Product Time Facade (ADR-037)
 *
 * Business and UI import from here. date-fns is confined to `engine/`.
 */

export type {
  Instant,
  TransferDate,
  Ymd,
  Hm,
  Clock,
  TimeStyle,
  PartialTimeStyle,
  PartialTimePresentationStyle,
  TimeContext,
  TimePresentationStyle,
  Weekday,
  TimeEngine,
  OnInvalid,
  LocaleId,
  TimeZoneId,
  TimeZonePolicy,
} from './types';

export {
  createTimeFacade,
  defaultTime,
  createSystemClock,
  createFixedClock,
  DEFAULT_TIME_PRESENTATION_STYLE,
  DEFAULT_TIME_STYLE,
  mergeTimePresentationStyle,
  mergeTimeStyle,
  type TimeFacade,
  type TimeFacadeOptions,
} from './facade';

export type { TimeCodec, CodecOptions } from './codec/codec';
export type { FormatApi } from './format/format';
export {
  splitDurationMs,
  splitDurationMinutes,
  formatDurationParts,
  type DurationParts,
} from './format/duration';
export type { TimeDisplaySlot } from './types';
export type { InputApi } from './input/input';
export type { CalendarApi } from './calendar/calendar';

export { asInstant, asTransferDate, asYmd, asHm } from './codec/brand';
export {
  calendarDateValueToYmd,
  ymdToCalendarDateValue,
  timeValueToHm,
  hmToTimeValue,
} from './ui/calendar-date-adapter';

export type {
  RecurrenceEnginePort,
  RecurrenceFrequency,
  RecurrenceRange,
  RecurrenceSchedule,
  RecurrenceWeekday,
} from './recurrence/recurrence-engine.port';
export { createRecurrenceEngine } from './recurrence';
export type { TimeZoneSource } from './timezone/time-zone';
export {
  createFixedTimeZoneSource,
  createSystemTimeZoneSource,
  createTimeContext,
  isIanaTimeZoneId,
  parseTimeZoneId,
  requireTimeZoneId,
  resolveTimeZoneId,
} from './timezone/time-zone';
export { TimeZoneIdSchema } from '@memoflow/contracts/primitives';
export { createDateFnsEngine } from './engine/date-fns-engine';
export {
  WALL_CLOCK_RESOLUTION_POLICY,
  addYmdDays,
  combineYmdHmWithTimeZone,
  instantToYmdInTimeZone,
  instantToHmInTimeZone,
  startOfYmdInTimeZone,
  type WallClockResolutionPolicy,
} from './timezone/wall-clock';

// Free-function helpers (thin defaultTime wrappers). Prefer facade.format.* when Style injection is available.
export {
  padTwoDigits,
  formatLocalHHmm,
  formatDateToYMD,
  formatHHmmParts,
  formatHour,
  formatDisplayDate,
} from './free/format-helpers';

export {
  timeStyleFromPresentationLocale,
  partialTimeStyleFromLocale,
  type PresentationLocaleLike,
} from './style/from-presentation-preference';

export {
  resolveEmptyLabel,
  isTimeEmptyKind,
  DEFAULT_EMPTY_LITERALS,
  type TimeEmptyKind,
  type ResolveEmptyLabelOptions,
} from './empty-catalog';

export { adaptLegacyTimeStyle, composeLegacyTimeStyle } from './style/legacy-time-style-adapter';
