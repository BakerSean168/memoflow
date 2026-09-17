import { z } from 'zod';

export const OperationSourceSchema = z.enum([
  'notification',
  'schedule-rebuild',
  'account-closure',
  'knowledge-projection',
]);

export const OperationStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'skipped',
  'failed',
  'retryable',
  'dead_letter',
  'cancelled',
]);

export const OperationTimelineEntrySchema = z.object({
  source: OperationSourceSchema,
  operationId: z.string(),
  status: OperationStatusSchema,
  failureReason: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  nextRetryAt: z.string().datetime().nullable(),
  replayable: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type OperationSource = z.infer<typeof OperationSourceSchema>;
export type OperationStatus = z.infer<typeof OperationStatusSchema>;
export type OperationTimelineEntry = z.infer<typeof OperationTimelineEntrySchema>;

export const OperationTimelineQuerySchema = z.object({
  identityId: z.string(),
  source: OperationSourceSchema.optional(),
  status: OperationStatusSchema.optional(),
  limit: z.number().int().positive().max(200).default(50),
});

export type OperationTimelineQuery = z.infer<typeof OperationTimelineQuerySchema>;

export const OperationReplayRequestSchema = z.object({
  source: OperationSourceSchema,
  operationId: z.string(),
  identityId: z.string(),
});

export type OperationReplayRequest = z.infer<typeof OperationReplayRequestSchema>;
