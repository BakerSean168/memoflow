import { z } from 'zod';
import { GoalStatus } from '../value-objects/goal-status';
import { GoalTimeframeSchema } from '../value-objects/goal-timeframe';
import { GoalReminderConfigDTOSchema } from '../value-objects/goal-reminder-config';
import { CreateGoalSchema } from './goal-crud.dto';
import { KeyResultInputSchema } from './key-result-input.schema';

/** Native editor rows can have temporary UI IDs. They are not persisted Goal/KR identities. */
export const GoalNativeDraftSchema = z
  .object({
    name: z.string().max(80),
    summary: z.string().max(255),
    description: z.string().max(10000),
    status: z.enum(GoalStatus),
    start: GoalTimeframeSchema.nullable(),
    target: GoalTimeframeSchema.nullable(),
    reminderConfig: GoalReminderConfigDTOSchema.nullable(),
    labelIds: z.array(z.string().min(1)).max(50),
    keyResults: z
      .array(
        KeyResultInputSchema.omit({ id: true }).extend({
          id: z.string().min(1).max(512).optional(),
        }),
      )
      .max(100),
  })
  .strict();

export const GoalDraftCheckpointContentSchema = z
  .object({
    createId: CreateGoalSchema.shape.id.unwrap(),
    draft: GoalNativeDraftSchema,
    workflowRunId: z.string().min(1).max(256).nullable(),
    phase: z.enum(['editing', 'submit_pending']),
  })
  .strict();
export const GoalDraftCheckpointSnapshotSchema = z
  .object({
    scope: z.string().min(1).max(512),
    version: z.number().int().nonnegative(),
    content: GoalDraftCheckpointContentSchema.nullable(),
  })
  .strict();
export type GoalNativeDraftDTO = z.infer<typeof GoalNativeDraftSchema>;
export type GoalDraftCheckpointContent = z.infer<typeof GoalDraftCheckpointContentSchema>;
export type GoalDraftCheckpointSnapshot = z.infer<typeof GoalDraftCheckpointSnapshotSchema>;
