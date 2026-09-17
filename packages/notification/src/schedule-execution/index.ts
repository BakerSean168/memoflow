import type {
  NotificationCategory,
  NotificationChannelType,
  NotificationType,
} from '@memoflow/contracts/notification';

export interface ScheduleNotificationRequest {
  readonly identityId: string;
  readonly title: string;
  readonly content: string;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  readonly channels?: readonly NotificationChannelType[];
  readonly expiresAt?: number | null;
}

export interface ScheduleNotificationPort {
  createNotification(request: ScheduleNotificationRequest): Promise<unknown>;
}

export { createNotificationPrismaScheduleNotificationPort } from '../server/infrastructure';
