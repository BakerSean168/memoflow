import { asInstant, type Instant, type RecurrenceEnginePort } from '@memoflow/time';
import {
  nextWallClockOccurrence,
  type RoutineTemporaryOverride,
  type WallClockTrigger,
} from './trigger';

export interface RoutineEligibleOccurrence {
  readonly occurrenceAt: Instant;
  readonly occurrenceKey: string;
}

/**
 * Canonical durable occurrence identity. One occurrence is exactly one
 * scheduled wall-clock instant for one routine — the same key shape used by
 * the scheduled handler fence and the notification idempotency key.
 */
export function buildRoutineOccurrenceKey(routineId: string, occurrenceAt: Instant): string {
  return `routine:${routineId}:oc:${Number(occurrenceAt)}`;
}

const MAX_OCCURRENCE_SCAN = 10_000;

function blockedByOverride(override: RoutineTemporaryOverride | null, at: Instant): boolean {
  if (!override) return false;
  const atMs = Number(at);
  if (atMs >= Number(override.expiresAt)) return false;
  if (override.snoozeUntil != null && atMs < Number(override.snoozeUntil)) return true;
  if (override.suppressUntil != null && atMs < Number(override.suppressUntil)) return true;
  return false;
}

/**
 * Next durable wall-clock occurrence for a scheduler-owned WallClock trigger.
 *
 * Durable wake-up timing exclusively delegates to RecurrenceEnginePort (Wave 1)
 * and skips candidates inside an active snooze/suppress window. Expired
 * overrides are neutral (see temporaryOverrideAllowsExecution). Returns null
 * when the recurrence is exhausted.
 */
export function computeRoutineNextEligibleOccurrence(input: {
  readonly routineId: string;
  readonly engine: RecurrenceEnginePort;
  readonly trigger: WallClockTrigger;
  readonly after: Instant;
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
}): RoutineEligibleOccurrence | null {
  const { routineId, engine, trigger, after } = input;
  const override = input.temporaryOverride ?? null;

  let cursor = after;
  for (let i = 0; i < MAX_OCCURRENCE_SCAN; i += 1) {
    const candidate = nextWallClockOccurrence(engine, trigger, cursor, false);
    if (candidate === null) return null;
    if (blockedByOverride(override, candidate)) {
      cursor = candidate;
      continue;
    }
    return {
      occurrenceAt: asInstant(Number(candidate)),
      occurrenceKey: buildRoutineOccurrenceKey(routineId, candidate),
    };
  }
  return null;
}
