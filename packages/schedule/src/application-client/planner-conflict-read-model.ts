import type {
  CalendarEventProjection,
  PlannerConflictProjection,
  PlannerProjectionRef,
} from '@memoflow/contracts/schedule';
import type { Instant } from '@memoflow/time';

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

function refOf(event: CalendarEventProjection): PlannerProjectionRef {
  return { sourceType: event.sourceType, sourceId: event.sourceId };
}

function refKey(ref: PlannerProjectionRef): string {
  return `${ref.sourceType}:${ref.sourceId}`;
}

function eventKey(event: CalendarEventProjection): string {
  return refKey(refOf(event));
}

function classifySeverity(overlapMs: number, leftDurationMs: number, rightDurationMs: number) {
  const fullyContainsOneSide = overlapMs === leftDurationMs || overlapMs === rightDurationMs;
  if (fullyContainsOneSide || overlapMs > ONE_HOUR_MS) return 'Severe' as const;
  if (overlapMs >= FIFTEEN_MINUTES_MS) return 'Moderate' as const;
  return 'Minor' as const;
}

/**
 * Derive cross-owner hard conflicts from canonical Planner projections.
 * Only blocking Timed ranges participate. Marker/non-blocking/AllDay facts are
 * deliberately visible in Planner while remaining outside hard-conflict truth.
 */
export function derivePlannerConflicts(
  projections: readonly CalendarEventProjection[],
): PlannerConflictProjection[] {
  const blocking = projections
    .filter(
      (event): event is Extract<CalendarEventProjection, { allDay: false }> =>
        event.occupancy === 'blocking' && !event.allDay && event.end != null,
    )
    .slice()
    .sort((a, b) => eventKey(a).localeCompare(eventKey(b)));

  const conflicts: PlannerConflictProjection[] = [];
  for (let leftIndex = 0; leftIndex < blocking.length; leftIndex += 1) {
    const left = blocking[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < blocking.length; rightIndex += 1) {
      const right = blocking[rightIndex]!;
      if (left.identityId !== right.identityId) continue;

      const overlapStart = Math.max(Number(left.start), Number(right.start));
      const overlapEnd = Math.min(Number(left.end), Number(right.end));
      if (overlapStart >= overlapEnd) continue;

      const overlapDurationMs = overlapEnd - overlapStart;
      const leftRef = refOf(left);
      const rightRef = refOf(right);
      conflicts.push({
        id: `${refKey(leftRef)}|${refKey(rightRef)}|${overlapStart}:${overlapEnd}`,
        identityId: left.identityId,
        left: leftRef,
        right: rightRef,
        overlapRange: {
          kind: 'Timed',
          start: overlapStart as Instant,
          end: overlapEnd as Instant,
        },
        overlapDurationMs,
        severity: classifySeverity(
          overlapDurationMs,
          Number(left.end) - Number(left.start),
          Number(right.end) - Number(right.start),
        ),
        // Cross-owner automatic moves require owner-specific policy. Keep this
        // empty rather than inventing a mutation that bypasses ownerCommandTarget.
        suggestions: [],
      });
    }
  }
  return conflicts;
}

/** Stable set of source identities participating in at least one derived conflict. */
export function plannerConflictSourceKeys(
  conflicts: readonly PlannerConflictProjection[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const conflict of conflicts) {
    keys.add(refKey(conflict.left));
    keys.add(refKey(conflict.right));
  }
  return keys;
}

export function plannerProjectionKey(projection: CalendarEventProjection): string {
  return eventKey(projection);
}
