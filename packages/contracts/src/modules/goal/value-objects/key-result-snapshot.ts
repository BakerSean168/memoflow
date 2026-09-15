import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { KeyResultId } from '../../../primitives';
import { KeyResultCalculationMethod } from './key-result-calculation-method';

/** Authoritative KR measurement snapshot used by Goal Review. */
export const KeyResultSnapshotDTOSchema = z.object({
  keyResultId: brandedId<KeyResultId>(),
  title: z.string(),
  currentValue: z.number(),
  targetValue: z.number(),
  initialValue: z.number(),
  aggregationMethod: z.enum(KeyResultCalculationMethod),
  weight: z.number().int().min(1).max(5),
  progressPercentage: z.number().min(0).max(100),
});
export type KeyResultSnapshot = z.infer<typeof KeyResultSnapshotDTOSchema>;
export type KeyResultSnapshotDTO = KeyResultSnapshot;
