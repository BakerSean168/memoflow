/**
 * 通知类型枚举
 */
export const NotificationType = {
  Info: 'Info',
  Success: 'Success',
  Warning: 'Warning',
  Error: 'Error',
  Reminder: 'Reminder',
  System: 'System',
  Social: 'Social',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
