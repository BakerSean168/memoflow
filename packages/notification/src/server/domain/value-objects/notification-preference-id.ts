import { createIdType } from '@memoflow/utils/domain';

import type { NotificationPreferenceId as INotificationPreferenceId } from '@memoflow/notification-contracts';

/**
 * NotificationPreferenceId 值对象
 * 用于强类型化通知偏好 ID
 */
export const NotificationPreferenceId = createIdType<INotificationPreferenceId>(
  'INotificationPreferenceId',
);
export type NotificationPreferenceId = INotificationPreferenceId;
