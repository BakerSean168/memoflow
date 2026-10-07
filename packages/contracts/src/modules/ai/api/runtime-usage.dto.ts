import { z } from 'zod';
export const AIRuntimeUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
});
export type AIRuntimeUsage = z.infer<typeof AIRuntimeUsageSchema>;

export const AIRuntimeUsageQueryClientRequestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    identityId: z.never().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.conversationId || value.runId), {
    message: 'conversationId or runId is required',
  });
export type AIRuntimeUsageQueryClientRequest = z.infer<
  typeof AIRuntimeUsageQueryClientRequestSchema
>;

export const AIRuntimeUsageSummarySchema = AIRuntimeUsageSchema.extend({
  executionCount: z.number().int().nonnegative(),
});
export type AIRuntimeUsageSummary = z.infer<typeof AIRuntimeUsageSummarySchema>;
