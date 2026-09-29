import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { KeyResultId } from '../../../primitives';
import { KeyResultCalculationMethod } from '../value-objects/key-result-calculation-method';
import {
  KEY_RESULT_DESCRIPTION_MAX_LENGTH,
  KEY_RESULT_TITLE_MAX_LENGTH,
} from '../value-objects/key-result-limits';
import { GoalTimeframeSchema } from '../value-objects/goal-timeframe';

/** Canonical create input for KR Measurement V3. */
export const KeyResultInputSchema = z
  .object({
    id: brandedId<KeyResultId>().optional(),
    title: z.string().min(1).max(KEY_RESULT_TITLE_MAX_LENGTH),
    description: z.string().max(KEY_RESULT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    calculationMethod: z.enum(KeyResultCalculationMethod).default(KeyResultCalculationMethod.Sum),
    initialValue: z.number().default(0),
    currentValue: z.number().optional(),
    targetValue: z.number(),
    target: GoalTimeframeSchema.nullable().optional(),
    unit: z.string().max(20).nullable().optional(),
    weight: z.number().int().min(1).max(5).default(3),
  })
  .strict();

export type KeyResultInput = z.infer<typeof KeyResultInputSchema>;
