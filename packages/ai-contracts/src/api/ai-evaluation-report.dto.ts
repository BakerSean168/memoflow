import { z } from 'zod';

export const AIEvaluationModeSchema = z.enum(['deterministic', 'live']);
export type AIEvaluationMode = z.infer<typeof AIEvaluationModeSchema>;

export const GetAIEvaluationOverviewSchema = z.object({
  historyLimit: z.coerce.number().int().min(1).max(20).default(5).optional(),
});
export type GetAIEvaluationOverviewReq = z.infer<typeof GetAIEvaluationOverviewSchema>;

export const AIEvaluationCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().min(1),
});
export type AIEvaluationCheck = z.infer<typeof AIEvaluationCheckSchema>;

export const AIEvaluationResultSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  passed: z.boolean(),
  score: z.number(),
  checks: z.array(AIEvaluationCheckSchema),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AIEvaluationResult = z.infer<typeof AIEvaluationResultSchema>;

export const AIEvaluationReportSchema = z.object({
  generatedAt: z.string().min(1),
  mode: AIEvaluationModeSchema,
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  casesPath: z.string().min(1),
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  byType: z.record(z.string(), z.number().int().nonnegative()),
  failedCaseIds: z.array(z.string().min(1)),
  gatePassed: z.boolean(),
  gateFailures: z.array(z.string().min(1)),
  baselinePath: z.string().min(1).optional(),
  archivePath: z.string().min(1).optional(),
  results: z.array(AIEvaluationResultSchema),
});
export type AIEvaluationReport = z.infer<typeof AIEvaluationReportSchema>;

export const AIEvaluationHistoryEntrySchema = z.object({
  fileName: z.string().min(1),
  generatedAt: z.string().min(1),
  mode: AIEvaluationModeSchema,
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  passRate: z.number().min(0).max(1),
  totalCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  gatePassed: z.boolean(),
  archivePath: z.string().min(1),
});
export type AIEvaluationHistoryEntry = z.infer<typeof AIEvaluationHistoryEntrySchema>;

export const AIEvaluationOverviewSchema = z.object({
  latest: z.object({
    deterministic: AIEvaluationReportSchema.optional(),
    live: AIEvaluationReportSchema.optional(),
  }),
  history: z.object({
    deterministic: z.array(AIEvaluationHistoryEntrySchema),
    live: z.array(AIEvaluationHistoryEntrySchema),
  }),
});
export type GetAIEvaluationOverviewRes = z.infer<typeof AIEvaluationOverviewSchema>;
