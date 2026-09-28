import { asInstant, type Instant } from '@memoflow/time';
import type { RoutineOccurrenceResolutionState } from '../ports/routine-occurrence-truth-store.port';
import type { ElapsedTrigger, RoutineTemporaryOverride } from './trigger';

export interface DurableElapsedOccurrenceSnapshot {
  readonly occurrenceKey: string;
  readonly sourceRevision: string | null;
  readonly resolutionState: RoutineOccurrenceResolutionState;
  readonly resolvedAt: Instant | number | null;
}

export interface DurableElapsedNextOccurrence {
  readonly occurrenceKey: string;
  readonly dueAt: Instant;
  readonly runAt: Instant;
  readonly anchorAt: Instant;
  readonly anchorRevision: string;
  readonly generation: number;
}

function generationFromKey(occurrenceKey: string): number | null {
  const suffix = occurrenceKey.slice(occurrenceKey.lastIndexOf(':') + 1);
  const generation = Number(suffix);
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

function delayedRunAt(dueAt: Instant, override: RoutineTemporaryOverride | null): Instant {
  if (!override) return dueAt;
  const dueMs = Number(dueAt);
  if (dueMs >= Number(override.expiresAt)) return dueAt;

  const blockingEnds = [override.snoozeUntil, override.suppressUntil]
    .filter((value): value is Instant => value != null && Number(value) > dueMs)
    .map(Number);
  if (blockingEnds.length === 0) return dueAt;
  return asInstant(Math.min(Number(override.expiresAt), Math.max(...blockingEnds)));
}

/**
 * Computes the one durable Scheduler intent for an Elapsed trigger.
 *
 * Scheduler-owned Elapsed waits for business resolution before creating the
 * next occurrence. last-satisfied resets the anchor on completion, while
 * routine-activation preserves the durable activation boundary and advances
 * the generation number.
 */
export function computeDurableElapsedNextOccurrence(input: {
  readonly routineId: string;
  readonly trigger: Extract<ElapsedTrigger, { timingOwner: 'scheduler' }>;
  readonly activatedAt: Date | Instant | number | null;
  readonly occurrences: readonly DurableElapsedOccurrenceSnapshot[];
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
}): DurableElapsedNextOccurrence | null {
  const activatedAtMs =
    input.activatedAt instanceof Date ? input.activatedAt.getTime() : Number(input.activatedAt);
  if (!Number.isFinite(activatedAtMs)) return null;

  const satisfied = [...input.occurrences]
    .filter(
      (occurrence) =>
        occurrence.resolutionState === 'Satisfied' &&
        occurrence.resolvedAt != null &&
        Number(occurrence.resolvedAt) >= activatedAtMs,
    )
    .sort((a, b) => Number(b.resolvedAt) - Number(a.resolvedAt))[0];

  const useSatisfiedAnchor =
    input.trigger.anchor === 'last-satisfied' && satisfied?.resolvedAt != null;
  const anchorAt = asInstant(useSatisfiedAnchor ? Number(satisfied!.resolvedAt) : activatedAtMs);
  const anchorRevision = useSatisfiedAnchor
    ? 'satisfied-' + Number(anchorAt)
    : 'activation-' + Number(anchorAt);

  const prefix = 'routine:' + input.routineId + ':elapsed:' + anchorRevision + ':';
  const matching = input.occurrences
    .map((occurrence) => ({
      occurrence,
      generation: generationFromKey(occurrence.occurrenceKey),
    }))
    .filter(
      (
        entry,
      ): entry is {
        occurrence: DurableElapsedOccurrenceSnapshot;
        generation: number;
      } => entry.generation != null && entry.occurrence.occurrenceKey.startsWith(prefix),
    )
    .sort((a, b) => b.generation - a.generation);

  if (matching.some((entry) => entry.occurrence.resolutionState === 'Open')) {
    return null;
  }

  const latestResolvedAt = matching
    .map((entry) => entry.occurrence.resolvedAt)
    .filter((value): value is Instant | number => value != null)
    .map(Number)
    .sort((a, b) => b - a)[0];
  const nextByHistory = (matching[0]?.generation ?? 0) + 1;
  const nextByResolution =
    latestResolvedAt == null
      ? 1
      : Math.floor(Math.max(0, latestResolvedAt - Number(anchorAt)) / input.trigger.durationMs) + 1;
  const generation = Math.max(nextByHistory, nextByResolution);
  const dueAt = asInstant(Number(anchorAt) + input.trigger.durationMs * generation);
  const runAt = delayedRunAt(dueAt, input.temporaryOverride ?? null);
  return {
    occurrenceKey: prefix + generation,
    dueAt,
    runAt,
    anchorAt,
    anchorRevision,
    generation,
  };
}
