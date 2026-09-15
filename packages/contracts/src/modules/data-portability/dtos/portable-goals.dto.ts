/** Portable Goal vNext DTOs — schemaVersion 2. */
import { z } from 'zod';
import { PortableRefSchema, IsoDateString } from './portable-common.dto';
import { KeyResultCalculationMethod } from '../../goal/value-objects/key-result-calculation-method';
import { GoalStatus } from '../../goal/value-objects/goal-status';
import { GoalTimeframeSchema } from '../../goal/value-objects/goal-timeframe';
import { YmdSchema } from '../../../primitives';

export const PortableKeyResultSchema = z.object({
  _ref: PortableRefSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  calculationMethod: z.enum(KeyResultCalculationMethod),
  initialValue: z.number(),
  trackingBaseValue: z.number(),
  targetValue: z.number(),
  currentValue: z.number(),
  target: GoalTimeframeSchema.nullable().optional(),
  unit: z.string().nullable().optional(),
  weight: z.number(),
  sortOrder: z.number(),
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict();
export type PortableKeyResult = z.infer<typeof PortableKeyResultSchema>;

const PortableReviewTrendPointSchema = z.object({
  at: z.number().int(),
  progressPercentage: z.number().min(0).max(100),
}).strict();

const PortableReviewKeyResultContextSchema = z.object({
  keyResultRef: PortableRefSchema,
  title: z.string(),
  unit: z.string().nullable(),
  startPercentage: z.number().min(0).max(100),
  endPercentage: z.number().min(0).max(100),
  deltaPercentage: z.number(),
  trend: z.array(PortableReviewTrendPointSchema),
}).strict();

export const PortableGoalReviewSystemContextSchema = z.object({
  windowStartAt: z.number().int(),
  windowEndAt: z.number().int(),
  overallProgress: z.object({
    startPercentage: z.number().min(0).max(100),
    endPercentage: z.number().min(0).max(100),
    deltaPercentage: z.number(),
  }).strict(),
  keyResults: z.array(PortableReviewKeyResultContextSchema),
  summary: z.object({
    recordCount: z.number().int().min(0),
    manualRecordCount: z.number().int().min(0),
    taskContributionCount: z.number().int().min(0),
  }).strict(),
}).strict();
export type PortableGoalReviewSystemContext = z.infer<typeof PortableGoalReviewSystemContextSchema>;

export const PortableGoalReviewSchema = z.object({
  _ref: PortableRefSchema,
  reflection: z.string(),
  challenges: z.string().nullable().optional(),
  adjustments: z.string().nullable().optional(),
  systemContext: PortableGoalReviewSystemContextSchema,
  reviewedAt: IsoDateString,
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict();
export type PortableGoalReview = z.infer<typeof PortableGoalReviewSchema>;

export const PortableGoalSchema = z.object({
  _ref: PortableRefSchema,
  name: z.string(),
  summary: z.string().max(500).nullable().optional(),
  status: z.enum(GoalStatus),
  startDate: YmdSchema.nullable().optional(),
  target: GoalTimeframeSchema.nullable().optional(),
  completedAt: IsoDateString.nullable().optional(),
  archivedAt: IsoDateString.nullable().optional(),
  sortOrder: z.number(),
  reminderConfig: z.unknown().optional(),
  keyResults: z.array(PortableKeyResultSchema),
  goalReviews: z.array(PortableGoalReviewSchema),
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict();
export type PortableGoal = z.infer<typeof PortableGoalSchema>;

export const PortableGoalRecordSchema = z.object({
  _ref: PortableRefSchema,
  keyResultRef: PortableRefSchema,
  value: z.number(),
  note: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  recordedAt: IsoDateString,
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict();
export type PortableGoalRecord = z.infer<typeof PortableGoalRecordSchema>;

export const PortableGoalDataSchema = z.object({
  items: z.array(PortableGoalSchema),
  records: z.array(PortableGoalRecordSchema),
}).strict();
export type PortableGoalData = z.infer<typeof PortableGoalDataSchema>;
