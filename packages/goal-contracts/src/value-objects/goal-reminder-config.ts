/**
 * Goal Reminder Config Value Object Contracts
 * 目标提醒配置值对象契约
 *
 * 注意：Contracts 包只包含纯类型定义，不包含业务逻辑或方法
 */

import { z } from 'zod';
import { ReminderTriggerType } from './reminder-trigger-type';

// Residual 741: GoalReminderConfigDTO / ReminderTrigger dual bodies retired —
// OpenAPI + transport use *Schema (semantic types are z.infer aliases).

export const ReminderTriggerSchema = z.object({
  type: z.enum(ReminderTriggerType),
  value: z.number(),
  enabled: z.boolean(),
});

export type ReminderTrigger = z.infer<typeof ReminderTriggerSchema>;

// ============ Domain Shape (领域层) ============

/**
 * 目标提醒配置 - Domain Shape
 * 给 domain-shared 中的 Class 实现用
 */
export interface GoalReminderConfig {
  enabled: boolean; // 总开关
  triggers: ReminderTrigger[]; // 触发器列表
}

export const GoalReminderConfigDTOSchema = z.object({
  enabled: z.boolean(),
  triggers: z.array(ReminderTriggerSchema),
});

export type GoalReminderConfigDTO = z.infer<typeof GoalReminderConfigDTOSchema>;
