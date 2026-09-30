import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { KeyResultId } from '../../../primitives';

export const GoalReviewTrendPointSchema = z.object({
  at: z.number().int(),
  progressPercentage: z.number().min(0).max(100),
});
export type GoalReviewTrendPoint = z.infer<typeof GoalReviewTrendPointSchema>;

export const GoalReviewKeyResultContextSchema = z.object({
  keyResultId: brandedId<KeyResultId>(),
  title: z.string(),
  unit: z.string().nullable(),
  startPercentage: z.number().min(0).max(100),
  endPercentage: z.number().min(0).max(100),
  deltaPercentage: z.number(),
  trend: z.array(GoalReviewTrendPointSchema),
});
export type GoalReviewKeyResultContext = z.infer<typeof GoalReviewKeyResultContextSchema>;

/** Direction uses canonical normalized progress, never raw measurement values. */
export const GoalReviewMovementEvidenceSchema = z
  .object({
    startPercentage: z.number().min(0).max(100),
    endPercentage: z.number().min(0).max(100),
    deltaPercentage: z.number(),
  })
  .strict();
export const GoalReviewKeyResultMovementEvidenceSchema = GoalReviewMovementEvidenceSchema.extend({
  keyResultId: brandedId<KeyResultId>(),
  title: z.string(),
  direction: z.enum(['improved', 'regressed', 'unchanged']),
});
export const GoalReviewOverallSignalSchema = z
  .object({
    kind: z.literal('overall-movement'),
    direction: z.enum(['increased', 'decreased', 'unchanged']),
    evidence: GoalReviewMovementEvidenceSchema,
  })
  .strict();
export const GoalReviewKeyResultSignalSchema = z
  .object({
    kind: z.literal('key-result-movement'),
    evidence: z.array(GoalReviewKeyResultMovementEvidenceSchema),
  })
  .strict();
export const GoalReviewActivitySignalSchema = z
  .object({
    kind: z.literal('measurement-activity'),
    evidence: z
      .object({
        recordCount: z.number().int().min(0),
        manualRecordCount: z.number().int().min(0),
        taskContributionCount: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export const GoalReviewSignalSchema = z.discriminatedUnion('kind', [
  GoalReviewOverallSignalSchema,
  GoalReviewKeyResultSignalSchema,
  GoalReviewActivitySignalSchema,
]);
export type GoalReviewSignal = z.infer<typeof GoalReviewSignalSchema>;

export const GoalReviewSystemContextSchema = z.object({
  // Legacy snapshots retain facts without inventing historical signals.
  signals: z.array(GoalReviewSignalSchema).default([]),
  windowStartAt: z.number().int(),
  windowEndAt: z.number().int(),
  overallProgress: z.object({
    startPercentage: z.number().min(0).max(100),
    endPercentage: z.number().min(0).max(100),
    deltaPercentage: z.number(),
  }),
  keyResults: z.array(GoalReviewKeyResultContextSchema),
  summary: z.object({
    recordCount: z.number().int().min(0),
    manualRecordCount: z.number().int().min(0),
    taskContributionCount: z.number().int().min(0),
  }),
});
export type GoalReviewSystemContext = z.infer<typeof GoalReviewSystemContextSchema>;
