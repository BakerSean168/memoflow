import type { ReminderType } from '../value-objects/reminder-type';
import type { TriggerType } from '../value-objects/trigger-type';
import type { NotificationChannel } from '../value-objects/notification-channel';
import type { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { ReminderTemplateId } from '../../../primitives';

/**
 * Residual 647: ReminderTemplateSummaryDTO / ReminderDashboardDTO dead duals retired.
 * List/upcoming surfaces use ReminderTemplateClientDTO / UpcomingReminderDTO only.
 */

/**
 * 即将到来的提醒 DTO（前端友好）
 */
export interface UpcomingReminderDTO {
  // 提醒信息
  templateId: ReminderTemplateId;
  title: string;
  description?: string;
  type: ReminderType;
  triggerType: TriggerType;
  importanceLevel: ImportanceLevel;

  // 触发时间
  nextTriggerAt: number; // epoch ms
  nextTriggerDisplay: string; // 人类可读的格式 "2025-11-18 16:30"
  daysUntilTrigger: number; // 距离现在的天数

  // 显示属性
  icon: string;
  color: string;

  // 通知配置
  notificationChannels: NotificationChannel[];
}
