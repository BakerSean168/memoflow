import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { TaskOccurrenceId } from '../../../primitives';
import { TaskTimeConfigSchema } from '../value-objects/task-time-config';
import type { TaskOccurrenceClientDTO } from '../aggregates/task-occurrence-client';

function requireRescheduleDate(
  value: { newTime: { startDate: number | null } },
  ctx: z.RefinementCtx,
): void {
  if (value.newTime.startDate == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newTime', 'startDate'],
      message: '重新安排任务实例必须提供 startDate',
    });
  }
}

export const RescheduleTaskBodySchema = z
  .object({
    newTime: TaskTimeConfigSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine(requireRescheduleDate);
export type RescheduleTaskInput = z.infer<typeof RescheduleTaskBodySchema>;

/** Existing RPC shape retained and completed for Electron/typed RPC callers. */
export const RescheduleTaskSchema = z
  .object({
    instanceId: brandedId<TaskOccurrenceId>(),
    newTime: TaskTimeConfigSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine(requireRescheduleDate);

export type RescheduleTaskReq = z.infer<typeof RescheduleTaskSchema>;
export type RescheduleTaskRes = TaskOccurrenceClientDTO;

export const ToggleTaskCompletionSchema = z.object({
  instanceId: brandedId<TaskOccurrenceId>(),
  note: z.string().optional(),
});

export type ToggleTaskCompletionReq = z.infer<typeof ToggleTaskCompletionSchema>;
