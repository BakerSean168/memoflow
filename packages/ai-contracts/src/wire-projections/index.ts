/** AI planning wire vocabulary. Independent of owner-package runtime schemas. */
import { z } from 'zod';
import { brandedId, ID_PREFIXES } from '@memoflow/shared-primitives';
import {
  GoalReminderConfigDTOSchema,
  ReminderTriggerSchema,
} from './goal/value-objects/goal-reminder-config';
export * from './goal/value-objects/goal-timeframe';
export * from './goal/value-objects/goal-status';
export * from './goal/value-objects/key-result-calculation-method';
export * from './goal/value-objects/key-result-limits';
export * from './task/value-objects/task-plan-schedule';
export * from './task/value-objects/task-goal-binding';
export * from './task/value-objects/task-reminder-config';
export * from './repository/aggregates/knowledge-document-identity';
export const CreateGoalSchema = z.object({
  name: z.string().trim().min(1, '目标名称不能为空').max(80, '目标名称不能超过 80 字符'),
  summary: z.string().trim().max(255, '目标摘要不能超过 255 字符').optional(),
  description: z.string().max(10000, '目标描述不能超过 10000 字符').optional(),
  reminderConfig: GoalReminderConfigDTOSchema.extend({
    triggers: z.array(ReminderTriggerSchema.extend({ value: z.number().min(0) })).max(10),
  })
    .nullable()
    .optional(),
});
type TaskPlanId = string & { readonly __brand: 'TaskPlanId' };
export const CreateTaskPlanSchema = z.object({
  id: brandedId<TaskPlanId>(ID_PREFIXES.TaskPlanId).optional(),
});
