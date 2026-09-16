import { z } from 'zod';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';
import { YmdSchema } from '../../primitives';
import { GoalReminderConfigDTOSchema } from './value-objects/goal-reminder-config';
import { GoalStatus } from './value-objects/goal-status';
import { GoalTimeframeSchema } from './value-objects/goal-timeframe';
import { KeyResultCalculationMethod } from './value-objects/key-result-calculation-method';

const GoalPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('goals:'),
  'Goal portable references must use the goals capability',
);
const LabelPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('labels:'),
  'Goal label references must use the labels capability',
);
const PortableInstantSchema = z.number().int().nonnegative();
const PortablePercentageSchema = z.number().finite().min(0).max(100);

export const GoalPortableKeyResultV3Schema = z
  .object({
    ref: GoalPortableReferenceV3Schema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable(),
    calculationMethod: z.enum(KeyResultCalculationMethod),
    initialValue: z.number().finite(),
    currentValue: z.number().finite(),
    trackingBaseValue: z.number().finite(),
    targetValue: z.number().finite(),
    target: GoalTimeframeSchema.nullable(),
    unit: z.string().max(20).nullable(),
    weight: z.number().int().min(1).max(5),
  })
  .strict();
export type GoalPortableKeyResultV3 = z.infer<typeof GoalPortableKeyResultV3Schema>;

export const GoalPortableRecordV3Schema = z
  .object({
    ref: GoalPortableReferenceV3Schema,
    keyResultRef: GoalPortableReferenceV3Schema,
    value: z.number().finite(),
    note: z.string().trim().max(2000).nullable(),
    recordedAt: PortableInstantSchema,
  })
  .strict();
export type GoalPortableRecordV3 = z.infer<typeof GoalPortableRecordV3Schema>;

const GoalPortableReviewTrendPointV3Schema = z
  .object({ at: PortableInstantSchema, progressPercentage: PortablePercentageSchema })
  .strict();

const GoalPortableReviewKeyResultContextV3Schema = z
  .object({
    keyResultRef: GoalPortableReferenceV3Schema,
    title: z.string().max(200),
    unit: z.string().max(20).nullable(),
    startPercentage: PortablePercentageSchema,
    endPercentage: PortablePercentageSchema,
    deltaPercentage: z.number().finite(),
    trend: z.array(GoalPortableReviewTrendPointV3Schema),
  })
  .strict();

export const GoalPortableReviewSystemContextV3Schema = z
  .object({
    windowStartAt: PortableInstantSchema,
    windowEndAt: PortableInstantSchema,
    overallProgress: z
      .object({
        startPercentage: PortablePercentageSchema,
        endPercentage: PortablePercentageSchema,
        deltaPercentage: z.number().finite(),
      })
      .strict(),
    keyResults: z.array(GoalPortableReviewKeyResultContextV3Schema),
    summary: z
      .object({
        recordCount: z.number().int().nonnegative(),
        manualRecordCount: z.number().int().nonnegative(),
        taskContributionCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((context, ctx) => {
    if (context.windowEndAt < context.windowStartAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowEndAt'],
        message: 'Review window must be ordered',
      });
    }
    if (
      context.summary.manualRecordCount + context.summary.taskContributionCount >
      context.summary.recordCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['summary'],
        message: 'Review record counts must reconcile',
      });
    }
  });
export type GoalPortableReviewSystemContextV3 = z.infer<
  typeof GoalPortableReviewSystemContextV3Schema
>;

export const GoalPortableReviewV3Schema = z
  .object({
    ref: GoalPortableReferenceV3Schema,
    reflection: z.string().trim().min(1).max(10000),
    challenges: z.string().trim().max(10000).nullable(),
    adjustments: z.string().trim().max(10000).nullable(),
    systemContext: GoalPortableReviewSystemContextV3Schema,
    reviewedAt: PortableInstantSchema,
  })
  .strict();
export type GoalPortableReviewV3 = z.infer<typeof GoalPortableReviewV3Schema>;

export const GoalPortableDefinitionV3Schema = z
  .object({
    ref: GoalPortableReferenceV3Schema,
    name: z.string().trim().min(1).max(200),
    summary: z.string().max(500).nullable(),
    status: z.enum(GoalStatus),
    startDate: YmdSchema.nullable(),
    target: GoalTimeframeSchema.nullable(),
    reminderConfig: GoalReminderConfigDTOSchema.nullable(),
    archived: z.boolean(),
    labelRefs: z.array(LabelPortableReferenceV3Schema).superRefine((refs, ctx) => {
      if (new Set(refs).size !== refs.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Goal label references must be unique',
        });
      }
    }),
    keyResults: z.array(GoalPortableKeyResultV3Schema),
    records: z.array(GoalPortableRecordV3Schema),
    reviews: z.array(GoalPortableReviewV3Schema),
  })
  .strict();
export type GoalPortableDefinitionV3 = z.infer<typeof GoalPortableDefinitionV3Schema>;

export const GoalPortablePayloadV3Schema = z
  .object({ goals: z.array(GoalPortableDefinitionV3Schema) })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    for (const [goalIndex, goal] of payload.goals.entries()) {
      const addRef = (ref: string, path: (string | number)[]) => {
        if (refs.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `Duplicate portable entity ref: ${ref}`,
          });
        }
        refs.add(ref);
      };
      addRef(goal.ref, ['goals', goalIndex, 'ref']);
      const keyResultRefs = new Set(goal.keyResults.map((keyResult) => keyResult.ref));
      for (const [keyResultIndex, keyResult] of goal.keyResults.entries()) {
        addRef(keyResult.ref, ['goals', goalIndex, 'keyResults', keyResultIndex, 'ref']);
      }
      for (const [recordIndex, record] of goal.records.entries()) {
        addRef(record.ref, ['goals', goalIndex, 'records', recordIndex, 'ref']);
        if (!keyResultRefs.has(record.keyResultRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['goals', goalIndex, 'records', recordIndex, 'keyResultRef'],
            message: 'Record Key Result reference must belong to its Goal',
          });
        }
      }
      for (const [reviewIndex, review] of goal.reviews.entries()) {
        addRef(review.ref, ['goals', goalIndex, 'reviews', reviewIndex, 'ref']);
        for (const [contextIndex, keyResult] of review.systemContext.keyResults.entries()) {
          if (!keyResultRefs.has(keyResult.keyResultRef)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'goals',
                goalIndex,
                'reviews',
                reviewIndex,
                'systemContext',
                'keyResults',
                contextIndex,
                'keyResultRef',
              ],
              message: 'Review Key Result reference must belong to its Goal',
            });
          }
        }
      }
    }
  });
export type GoalPortablePayloadV3 = z.infer<typeof GoalPortablePayloadV3Schema>;
