/**
 * 通知分类枚举
 */
export const NotificationCategory = {
  Task: 'Task',
  Goal: 'Goal',
  Schedule: 'Schedule',
  Reminder: 'Reminder',
  Account: 'Account',
  System: 'System',
  Other: 'Other',
} as const;

export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];
