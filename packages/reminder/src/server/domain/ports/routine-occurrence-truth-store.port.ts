import type { Instant } from '@memoflow/time';
import type { RoutineTemporaryOverride } from '../routine';

export const ROUTINE_OCCURRENCE_TRIGGER_KINDS = ['WallClock', 'Elapsed', 'ActiveUsage'] as const;
export type RoutineOccurrenceTriggerKind = (typeof ROUTINE_OCCURRENCE_TRIGGER_KINDS)[number];

export const ROUTINE_OCCURRENCE_RESOLUTION_STATES = [
  'Open',
  'Satisfied',
  'Skipped',
  'Expired',
] as const;
export type RoutineOccurrenceResolutionState =
  (typeof ROUTINE_OCCURRENCE_RESOLUTION_STATES)[number];

export const ROUTINE_OCCURRENCE_RESOLUTION_KINDS = [
  'ExplicitComplete',
  'NaturalBreakCredit',
  'ProtocolBreakCredit',
  'UserSkipped',
  'Expired',
] as const;
export type RoutineOccurrenceResolutionKind =
  (typeof ROUTINE_OCCURRENCE_RESOLUTION_KINDS)[number];

export const ROUTINE_INTERACTION_ACTIONS = [
  'Acknowledged',
  'Completed',
  'Snoozed',
  'Dismissed',
  'Skipped',
] as const;
export type RoutineInteractionAction = (typeof ROUTINE_INTERACTION_ACTIONS)[number];

/**
 * Business-facing Routine occurrence fact (ADR-077).
 *
 * This intentionally excludes Scheduler lease/fencing/attempt fields. Those
 * remain on the persistence row during the migration window, but they are not
 * part of Routine's product truth.
 */
export interface RoutineOccurrenceFact {
  readonly id: string;
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly triggerKind: RoutineOccurrenceTriggerKind;
  readonly scheduledFor: Instant | null;
  readonly becameDueAt: Instant;
  readonly sourceRevision: string | null;
  readonly resolutionState: RoutineOccurrenceResolutionState;
  readonly resolvedAt: Instant | null;
  readonly resolutionKind: RoutineOccurrenceResolutionKind | null;
  readonly resolutionReason: string | null;
}

export interface RoutineInteractionFact {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly action: RoutineInteractionAction;
  readonly actedAt: Instant;
  readonly responseLatencyMs: number | null;
  readonly snoozeDurationMs: number | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

export interface EnsureRoutineOccurrenceInput {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly triggerKind: RoutineOccurrenceTriggerKind;
  readonly becameDueAt: Instant | number;
  readonly scheduledFor?: Instant | number | null;
  readonly sourceRevision?: string | number | null;
}

export interface ResolveRoutineOccurrenceInput {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly state: Exclude<RoutineOccurrenceResolutionState, 'Open'>;
  readonly resolutionKind: RoutineOccurrenceResolutionKind;
  readonly resolvedAt: Instant | number;
  readonly reason?: string | null;
}

export interface ApplyRoutineInteractionInput {
  /** Stable command key supplied by the owner/surface so transport retries do not duplicate facts. */
  readonly idempotencyKey: string;
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly action: RoutineInteractionAction;
  readonly actedAt: Instant | number;
  readonly responseLatencyMs?: number | null;
  readonly snoozeDurationMs?: number | null;
  /** Snooze product state committed atomically with the interaction fact. */
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface RoutineInteractionApplyReceipt {
  readonly interaction: RoutineInteractionFact;
  readonly occurrence: RoutineOccurrenceFact;
  readonly replayed: boolean;
}

/**
 * Canonical Routine execution/response truth seam.
 *
 * `ensureOpenOccurrence` is idempotent by business occurrence key.
 * `resolveOccurrence` is monotonic: terminal states cannot be overwritten by a
 * different terminal state.
 * `applyInteraction` persists the interaction, any Completed/Skipped
 * resolution, and a Snoozed TemporaryOverride in one local database transaction.
 */
export interface RoutineOccurrenceTruthStore {
  ensureOpenOccurrence(input: EnsureRoutineOccurrenceInput): Promise<RoutineOccurrenceFact>;
  findOccurrence(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
  }): Promise<RoutineOccurrenceFact | null>;
  resolveOccurrence(input: ResolveRoutineOccurrenceInput): Promise<RoutineOccurrenceFact>;
  applyInteraction(input: ApplyRoutineInteractionInput): Promise<RoutineInteractionApplyReceipt>;
  listInteractions(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
  }): Promise<RoutineInteractionFact[]>;
}
