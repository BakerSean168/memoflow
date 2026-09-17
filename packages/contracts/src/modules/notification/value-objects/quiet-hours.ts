import type { Hm, TimeZoneId } from '../../../primitives';

export type NotificationWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface QuietHoursWindow {
  daysOfWeek: NotificationWeekday[];
  start: Hm;
  end: Hm;
}

/** Product-Time aware account quiet hours (ADR-088). */
export interface QuietHours {
  enabled: boolean;
  timeZone: TimeZoneId;
  weeklyWindows: QuietHoursWindow[];
}

export type QuietHoursDTO = QuietHours;
