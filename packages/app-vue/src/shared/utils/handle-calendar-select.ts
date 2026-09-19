import { CalendarDate } from '@internationalized/date';
import { calendarDateValueToYmd } from '@memoflow/time';

/** Calendar widget boundary: third-party calendar value -> canonical Ymd. */
export function handleCalendarSelect(date: unknown, setter: (value: string) => void): void {
  if (date && typeof date === 'object' && 'year' in date && 'month' in date && 'day' in date) {
    const value = date as { year: number; month: number; day: number };
    setter(calendarDateValueToYmd(new CalendarDate(value.year, value.month, value.day)));
    return;
  }
  setter('');
}
