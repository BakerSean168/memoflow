/**
 * 相对时间单位
 */
export const ReminderTimeUnit = {
  Minutes: 'Minutes',
  Hours: 'Hours',
  Days: 'Days',
} as const;

export type ReminderTimeUnit = (typeof ReminderTimeUnit)[keyof typeof ReminderTimeUnit];
