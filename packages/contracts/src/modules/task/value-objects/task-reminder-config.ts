/**
 * TaskReminderConfig Value Object - Server Interface
 */

// Ensure Zod.openapi() is available before schema construction (residual 1331).
import '../../../primitives/zod-extensions';
import { z } from 'zod';
import { TaskReminderType } from './task-reminder-type';
import { ReminderTimeUnit } from './reminder-time-unit';

// ============ 接口定义 ============

interface ReminderTrigger {
  type: TaskReminderType;
  absoluteTime: number | null;
  relativeValue: number | null;
  relativeUnit: ReminderTimeUnit | null;
}

export interface TaskReminderConfig {
  enabled: boolean;
  triggers: ReminderTrigger[];
}

// Residual 739: TaskReminderConfigDTO dual body retired — OpenAPI + transport use
// TaskReminderConfigSchema (semantic type is a z.infer alias).

export const TaskReminderConfigSchema = z
  .object({
    enabled: z.boolean(),
    triggers: z
      .array(
        z
          .object({
            type: z.enum([TaskReminderType.Absolute, TaskReminderType.Relative]),
            absoluteTime: z.number().int().nullable(),
            relativeValue: z.number().int().nullable(),
            relativeUnit: z
              .enum([ReminderTimeUnit.Minutes, ReminderTimeUnit.Hours, ReminderTimeUnit.Days])
              .nullable(),
          })
          .superRefine((trigger, ctx) => {
            if (trigger.type === TaskReminderType.Absolute && trigger.absoluteTime == null) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['absoluteTime'],
                message: '绝对时间提醒必须提供 absoluteTime',
              });
            }

            if (trigger.type === TaskReminderType.Relative) {
              if (trigger.relativeValue == null) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['relativeValue'],
                  message: '相对时间提醒必须提供 relativeValue',
                });
              }

              if (trigger.relativeUnit == null) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['relativeUnit'],
                  message: '相对时间提醒必须提供 relativeUnit',
                });
              }
            }
          }),
      )
      .max(10),
  })
  .openapi({ type: 'object', description: '任务提醒配置' });

export type TaskReminderConfigDTO = z.infer<typeof TaskReminderConfigSchema>;
