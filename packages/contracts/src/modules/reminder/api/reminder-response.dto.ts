import { z } from 'zod';
import { ReminderResponseAction } from '../entities/reminder-response-server';

/**
 * Record one user response without overloading response latency as snooze delay.
 * `responseTime` is optional analytics latency for every action.
 * `snoozeDurationSeconds` is required only for SNOOZED and forbidden otherwise.
 */
export const RecordReminderResponseSchema = z
  .object({
    action: z.enum(ReminderResponseAction),
    responseTime: z.number().int().nonnegative().optional(),
    snoozeDurationSeconds: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const isSnoozed = value.action === ReminderResponseAction.Snoozed;
    if (isSnoozed && value.snoozeDurationSeconds === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['snoozeDurationSeconds'],
        message: 'SNOOZED responses require snoozeDurationSeconds',
      });
    }
    if (!isSnoozed && value.snoozeDurationSeconds !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['snoozeDurationSeconds'],
        message: 'snoozeDurationSeconds is only valid for SNOOZED responses',
      });
    }
  });

export type RecordReminderResponseReq = z.infer<typeof RecordReminderResponseSchema>;
