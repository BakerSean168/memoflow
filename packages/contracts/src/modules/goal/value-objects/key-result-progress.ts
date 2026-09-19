import { z } from 'zod';
import { KeyResultCalculationMethod } from './key-result-calculation-method';

/** User-visible KR Measurement V3 projection. */
export interface KeyResultProgress {
  initialValue: number;
  currentValue: number;
  targetValue: number;
  aggregationMethod: KeyResultCalculationMethod;
  unit: string | null;
}

/**
 * Public/client KR measurement. Internal aggregation state is deliberately absent.
 */
export const KeyResultProgressDTOSchema = z
  .object({
    initialValue: z.number(),
    currentValue: z.number(),
    targetValue: z.number(),
    aggregationMethod: z.enum(KeyResultCalculationMethod),
    unit: z.string().max(20).nullable(),
  })
  .strict();

export type KeyResultProgressDTO = z.infer<typeof KeyResultProgressDTOSchema>;

/** Server/domain KR measurement. trackingBaseValue is never part of normal client UI. */
export interface KeyResultMeasurement extends KeyResultProgress {
  trackingBaseValue: number;
}
