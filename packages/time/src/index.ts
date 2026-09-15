/**
 * @memoflow/time — Product Time Facade (ADR-037)
 *
 * Business and UI import from here. Calendar/wall-clock semantics always require
 * an explicit TimeContext; date-fns is confined to `engine/`.
 */

export type {
  Instant,
  TransferDate,
  Ymd,
  Hm,
  Clock,
  PartialTimePresentationStyle,
  TimeContext,
  UserTimeContext,
  UserTimeContextPort,
  TimePresentationStyle,
  TimeDateStyle,
  TimeHourStyle,
  Weekday,
  TimeEngine,
  OnInvalid,
  LocaleId,
  TimeZoneId,
  TimeDisplaySlot,
} from './types';

export {
  createTimeFacade,
  createSystemClock,
  createFixedClock,
  DEFAULT_TIME_PRESENTATION_STYLE,
  mergeTimePresentationStyle,
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

// Pure helpers only. Context-sensitive date/time formatting belongs on TimeFacade.
export {
  padTwoDigits,
  formatHHmmParts,
  formatHour,
  formatDisplayDate,
} from './free/format-helpers';

export {
  resolveEmptyLabel,
  isTimeEmptyKind,
  DEFAULT_EMPTY_LITERALS,
  type TimeEmptyKind,
  type ResolveEmptyLabelOptions,
} from './empty-catalog';
