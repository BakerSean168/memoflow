import {
  GoalTimeframeKindSchema,
  goalTimeframeEndBoundary,
  goalTimeframeFromEndBoundary,
  goalTimeframeFromStartBoundary,
  goalTimeframeStartBoundary,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import { requireYmd } from '@memoflow/contracts/primitives';

export interface GoalStartTimeframePersistencePair {
  readonly startKind: string | null;
  readonly startDate: string | null;
}

export interface GoalTargetTimeframePersistencePair {
  readonly targetKind: string | null;
  readonly targetEndDate: string | null;
}

/**
 * Start and target are semantic GoalTimeframe values. Persistence stores one
 * canonical boundary plus the precision discriminant so the representation is
 * normalized and lossless.
 */
export function encodeGoalStartTimeframe(
  start: GoalTimeframe | null,
): GoalStartTimeframePersistencePair {
  if (start === null) return { startKind: null, startDate: null };
  return {
    startKind: start.kind,
    startDate: goalTimeframeStartBoundary(start),
  };
}

export function encodeGoalTimeframe(
  target: GoalTimeframe | null,
): GoalTargetTimeframePersistencePair {
  if (target === null) return { targetKind: null, targetEndDate: null };
  return {
    targetKind: target.kind,
    targetEndDate: goalTimeframeEndBoundary(target),
  };
}

export function decodeGoalStartTimeframe(
  startKind: string | null | undefined,
  startDate: string | null | undefined,
): GoalTimeframe | null {
  if (startKind == null && startDate == null) return null;
  if (startKind == null || startDate == null) {
    throw new TypeError('Goal start persistence requires both start_kind and start_date');
  }
  return goalTimeframeFromStartBoundary(
    GoalTimeframeKindSchema.parse(startKind),
    requireYmd(startDate),
  );
}

/**
 * Decode the normalized target pair and fail closed on partial/non-canonical
 * storage. The end boundary is a persistence/search projection, not a second
 * product deadline.
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
