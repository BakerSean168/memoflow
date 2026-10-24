/**
 * Residual 1007: sole reminder time-of-day helpers for API/Desktop automation
 * executors and app-vue goal workflow drafts.
 * HH:mm 24h pattern; invalid/missing values fall back to 09:00.
 */

export const DEFAULT_REMINDER_TIME_OF_DAY = '09:00';
export const REMINDER_TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeReminderTimeOfDay(value: string | undefined): string {
  return value && REMINDER_TIME_OF_DAY_PATTERN.test(value) ? value : DEFAULT_REMINDER_TIME_OF_DAY;
}

/** Next occurrence of HH:mm from `now` (rolls to tomorrow when already passed). */
export function buildReminderStartTimestamp(timeOfDay: string, now = Date.now()): number {
  const [hours = 9, minutes = 0] = timeOfDay.split(':').map((item) => Number(item));
  const start = new Date(now);
  start.setHours(hours, minutes, 0, 0);
  if (start.getTime() < now) {
    start.setDate(start.getDate() + 1);
  }
  return start.getTime();
}
