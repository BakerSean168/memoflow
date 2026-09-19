import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import type { Clock, TimeContext } from '../types';
import {
  addCalendarDaysInContext,
  diffCalendarDaysInContext,
  diffCalendarWeeksInContext,
  endOfDayInContext,
  instantToYmdInTimeZone,
  isSameDayInContext,
  startOfDayInContext,
  startOfWeekInContext,
} from '../timezone/wall-clock';

export interface CalendarApi {
  startOfDay(instant: Instant | number): Instant;
  endOfDay(instant: Instant | number): Instant;
  addDays(instant: Instant | number, n: number): Instant;
  diffCalendarDays(a: Instant | number, b: Instant | number): number;
  diffCalendarWeeks(a: Instant | number, b: Instant | number): number;
  startOfWeek(instant: Instant | number): Instant;
  toYmd(instant: Instant | number): Ymd;
  isSameDay(a: Instant | number, b: Instant | number): boolean;
  isToday(instant: Instant | number): boolean;
}

export function createCalendar(context: TimeContext, clock: Clock): CalendarApi {
  const asI = (value: Instant | number): Instant => value as Instant;
  return {
    startOfDay(instant) {
      return startOfDayInContext(asI(instant), context);
    },
    endOfDay(instant) {
      return endOfDayInContext(asI(instant), context);
    },
    addDays(instant, n) {
      return addCalendarDaysInContext(asI(instant), n, context);
    },
    diffCalendarDays(a, b) {
      return diffCalendarDaysInContext(asI(a), asI(b), context);
    },
    diffCalendarWeeks(a, b) {
      return diffCalendarWeeksInContext(asI(a), asI(b), context);
    },
    startOfWeek(instant) {
      return startOfWeekInContext(asI(instant), context);
    },
    toYmd(instant) {
      return instantToYmdInTimeZone(asI(instant), context.timeZone);
    },
    isSameDay(a, b) {
      return isSameDayInContext(asI(a), asI(b), context);
    },
    isToday(instant) {
      return isSameDayInContext(asI(instant), clock.now(), context);
    },
  };
}
