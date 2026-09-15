import {
  GoalTimeframeKindSchema,
  goalTimeframeEndBoundary,
  goalTimeframeFromEndBoundary,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import { requireYmd, type Ymd } from '@memoflow/contracts/primitives';

export interface GoalTimeframePersistencePair {
  readonly targetKind: string | null;
  readonly targetEndDate: string | null;
}

/** Encode one semantic Goal target into its normalized, lossless persistence pair. */
export function encodeGoalTimeframe(target: GoalTimeframe | null): GoalTimeframePersistencePair {
  if (target === null) return { targetKind: null, targetEndDate: null };
  return {
    targetKind: target.kind,
    targetEndDate: goalTimeframeEndBoundary(target),
  };
}

/**
 * Decode the normalized pair and fail closed on partial/non-canonical storage.
 * The end boundary is not a second product deadline; together with kind it is
 * the reversible storage representation of the precision-preserving target.
 */
export function decodeGoalTimeframe(
  targetKind: string | null | undefined,
  targetEndDate: string | null | undefined,
): GoalTimeframe | null {
  if (targetKind == null && targetEndDate == null) return null;
  if (targetKind == null || targetEndDate == null) {
    throw new TypeError('Goal target persistence requires both target_kind and target_end_date');
  }
  return goalTimeframeFromEndBoundary(
    GoalTimeframeKindSchema.parse(targetKind),
    requireYmd(targetEndDate),
  );
}

export function decodeGoalStartDate(value: string | null | undefined): Ymd | null {
  return value == null ? null : requireYmd(value);
}
