/**
 * Reminder Domain Services
 * 提醒模块领域服务
 *
 * 【规范说明：领域服务（Domain Service）】
 * 领域服务是跨聚合根的业务逻辑，使用场景：
 * - 一次操作涉及多个聚合根时
 * - 业务逻辑不属于任何单一聚合根
 * - 无状态类：整个业务逻辑执行后才保存
 * - 注入仓储：需要提供仓储接口
 *
 * 【业务逻辑服务（推荐使用）】
 * 纯业务逻辑服务（推荐使用）
 */
export { ReminderPolicy } from './reminder-policy';
export { ReminderRecurrenceCalculator } from './reminder-recurrence-calculator';

export { ReminderGroupBusinessService } from './reminder-group-business-service';
export type {
  GroupStatistics,
  GroupDeletionValidation,
  GroupNameValidation,
} from './reminder-group-business-service';

// 即将到来的提醒计算服务
export { UpcomingReminderCalculationService } from './upcoming-reminder-calculation-service';
export type { UpcomingReminderDTO } from '@memoflow/contracts/reminder';

// 旧的服务（待废弃）
export { ReminderTemplateControlService } from './reminder-template-control-service';
export type { ITemplateEffectiveStatus } from './reminder-template-control-service';

export { ReminderTriggerService } from './reminder-trigger-service';
export type { ITriggerReminderParams, ITriggerReminderResult } from './reminder-trigger-service';

export * from './reminder-domain-service';
export * from './legacy-routine-cutover-service';
