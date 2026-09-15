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

/** Stable user-owned KR facts for `goals@3`; host ids and history stay out of this payload. */
export const GoalPortableKeyResultV3Schema = z
  .object({
    ref: GoalPortableReferenceV3Schema,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    calculationMethod: z.enum(KeyResultCalculationMethod),
    initialValue: z.number(),
    currentValue: z.number(),
    trackingBaseValue: z.number(),
    targetValue: z.number(),
    target: GoalTimeframeSchema.nullable(),
    unit: z.string().max(20).nullable(),
    weight: z.number().int().min(1).max(5),
  })
  .strict();
export type GoalPortableKeyResultV3 = z.infer<typeof GoalPortableKeyResultV3Schema>;

/** Owner-owned definition payload. Records/reviews remain separate residual coverage until PORT-1610. */
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
  })
  .strict();
export type GoalPortableDefinitionV3 = z.infer<typeof GoalPortableDefinitionV3Schema>;

export const GoalPortablePayloadV3Schema = z
  .object({ goals: z.array(GoalPortableDefinitionV3Schema) })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    for (const [goalIndex, goal] of payload.goals.entries()) {
      if (refs.has(goal.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['goals', goalIndex, 'ref'],
          message: `Duplicate portable goal ref: ${goal.ref}`,
        });
      }
      refs.add(goal.ref);
      for (const [keyResultIndex, keyResult] of goal.keyResults.entries()) {
        if (refs.has(keyResult.ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['goals', goalIndex, 'keyResults', keyResultIndex, 'ref'],
            message: `Duplicate portable entity ref: ${keyResult.ref}`,
          });
        }
        refs.add(keyResult.ref);
      }
    }
  });
export type GoalPortablePayloadV3 = z.infer<typeof GoalPortablePayloadV3Schema>;
