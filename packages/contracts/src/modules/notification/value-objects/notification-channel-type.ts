/**
 * 通知渠道类型枚举
 */
export const NotificationChannelType = {
  InApp: 'InApp',
  Email: 'Email',
  Push: 'Push',
  Desktop: 'Desktop',
  Sms: 'Sms',
  Webhook: 'Webhook',
} as const;

export type NotificationChannelType =
  (typeof NotificationChannelType)[keyof typeof NotificationChannelType];
