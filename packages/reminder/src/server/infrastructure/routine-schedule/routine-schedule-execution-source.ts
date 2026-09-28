import { LeaseFencingException } from '@memoflow/contracts/reliable-messaging';
import type { RecurrenceEnginePort } from '@memoflow/time';
import {
  computeDurableElapsedNextOccurrence,
  computeRoutineNextEligibleOccurrence,
  requiresDurableScheduleProjection,
  RoutineDefinition,
  type ElapsedTrigger,
  type WallClockTrigger,
} from '../../domain/routine';
import type { RoutineOccurrenceNotificationWriterPort } from '../../domain/ports/routine-occurrence-notification-writer.port';
import { buildRoutineOccurrenceNotificationRequest } from './routine-occurrence-notification-writer';
import type { RoutineOccurrenceStore } from '../../domain/ports/routine-occurrence-store.port';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import type {
  RoutineOccurrenceCommittedEvent,
  RoutineScheduleStateReader,
} from './routine-schedule-projection-source';

export const ROUTINE_OCCURRENCE_LEASE_MS = 30_000;

/** Durable execution fence for one canonical wall-clock occurrence. */
export interface RoutineScheduleExecutionSource {
  executeRoutineOccurrence(
    input: RoutineScheduleExecutionInput,
  ): Promise<RoutineScheduleExecutionOutcome>;
}

export interface RoutineScheduleExecutionInput {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  /** Distinct NotificationRequested idempotency key for snooze re-presentation. */
  readonly notificationOccurrenceKey?: string;
  readonly triggerKind?: 'WallClock' | 'Elapsed';
  readonly scheduledFor: number;
  readonly dueAt?: number;
  readonly sourceRevision: string | number | null;
}

export type RoutineScheduleExecutionOutcome =
  | {
      readonly kind: 'succeeded';
      readonly occurrenceId: string;
      readonly nextOccurrenceAt: number | null;
      readonly notificationRequested: boolean;
    }
  | {
      readonly kind: 'skipped';
      readonly reason:
        'routine-unavailable' | 'no-eligible-occurrence' | 'revision-drifted' | 'already-finalized';
      readonly occurrenceId: string | null;
    }
  | { readonly kind: 'retryable'; readonly error: string }
  | { readonly kind: 'dead-letter'; readonly reason: 'fencing-rejected'; readonly error: string };

export interface RoutineScheduleExecutionDeps {
  readonly reader: Pick<RoutineScheduleStateReader, 'readRoutineScheduleSnapshot'>;
  readonly occurrenceStore: RoutineOccurrenceStore;
  readonly notificationWriter: RoutineOccurrenceNotificationWriterPort;
  readonly recurrenceEngine: RecurrenceEnginePort;
  readonly now?: () => number;
  /** Durable snooze/suppress store consumed by the Routine projection runtime. */
  readonly temporaryOverrideStore?: RoutineTemporaryOverrideStore;
  /** Durable post-commit signal consumed by the Routine projection runtime. */
  readonly publishOccurrenceCommitted?: (event: RoutineOccurrenceCommittedEvent) => void;
}

export function createRoutineScheduleExecutionSource(
  deps: RoutineScheduleExecutionDeps,
): RoutineScheduleExecutionSource {
  const now = deps.now ?? Date.now;

  return {
    async executeRoutineOccurrence(input) {
      const nowMs = now();

      const snapshot = await deps.reader.readRoutineScheduleSnapshot(
        input.routineId,
        input.identityId,
      );
      if (!snapshot) {
        return { kind: 'skipped', reason: 'routine-unavailable', occurrenceId: null };
      }

      const trigger = snapshot.definition.trigger;
      const triggerKind = input.triggerKind ?? 'WallClock';
      if (
        snapshot.globalEnabled === false ||
        !snapshot.definition.enabled ||
        !snapshot.durableProfileGateOpen ||
        !trigger ||
        !requiresDurableScheduleProjection(trigger) ||
        trigger.type !== triggerKind
      ) {
        return { kind: 'skipped', reason: 'routine-unavailable', occurrenceId: null };
      }

      if (
        input.sourceRevision != null &&
        Number(input.sourceRevision) !== snapshot.definition.version
      ) {
        return { kind: 'skipped', reason: 'revision-drifted', occurrenceId: null };
      }

      if (trigger.type === 'WallClock') {
        const eligible = computeRoutineNextEligibleOccurrence({
          routineId: input.routineId,
          engine: deps.recurrenceEngine,
          trigger,
          after: input.scheduledFor - 1,
          temporaryOverride: snapshot.temporaryOverride,
        });
        if (
          !eligible ||
          Number(eligible.occurrenceAt) !== input.scheduledFor ||
          eligible.occurrenceKey !== input.occurrenceKey
        ) {
          return { kind: 'skipped', reason: 'no-eligible-occurrence', occurrenceId: null };
        }
      } else {
        const alreadyOpen = (snapshot.elapsedOccurrences ?? []).some(
          (occurrence) =>
            occurrence.occurrenceKey === input.occurrenceKey &&
            occurrence.resolutionState === 'Open',
        );
        if (alreadyOpen && input.notificationOccurrenceKey != null) {
          const snoozeUntil = snapshot.temporaryOverride?.snoozeUntil ?? null;
          const expectedNotificationOccurrenceKey =
            input.occurrenceKey + ':snooze:' + input.scheduledFor;
          if (
            snoozeUntil == null ||
            Number(snoozeUntil) !== input.scheduledFor ||
            input.notificationOccurrenceKey !== expectedNotificationOccurrenceKey
          ) {
            return { kind: 'skipped', reason: 'no-eligible-occurrence', occurrenceId: null };
          }
        }
        if (!alreadyOpen) {
          const eligible = computeDurableElapsedNextOccurrence({
            routineId: input.routineId,
            trigger,
            activatedAt: snapshot.definition.activatedAt,
            occurrences: snapshot.elapsedOccurrences ?? [],
            temporaryOverride: snapshot.temporaryOverride ?? null,
          });
          if (
            !eligible ||
            Number(eligible.runAt) !== input.scheduledFor ||
            Number(eligible.dueAt) !== (input.dueAt ?? input.scheduledFor) ||
            eligible.occurrenceKey !== input.occurrenceKey
          ) {
            return { kind: 'skipped', reason: 'no-eligible-occurrence', occurrenceId: null };
          }
        }
      }

      const lease = await deps.occurrenceStore.claimOccurrence({
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        triggerKind,
        scheduledFor: input.scheduledFor,
        becameDueAt: input.dueAt ?? input.scheduledFor,
        sourceRevision: input.sourceRevision,
        claimedAt: nowMs,
        leaseExpiresAt: nowMs + ROUTINE_OCCURRENCE_LEASE_MS,
      });

      const notificationRequest = buildRoutineOccurrenceNotificationRequest({
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        ...(input.notificationOccurrenceKey
          ? { notificationOccurrenceKey: input.notificationOccurrenceKey }
          : {}),
        scheduledFor: input.dueAt ?? input.scheduledFor,
        sourceRevision: input.sourceRevision,
        routineName: snapshot.definition.name,
        routineDescription: snapshot.definition.description,
      });

      if (lease.alreadyFinalized) {
        // Crash/retry replay: the durable commit already landed, so we only
        // re-confirm the idempotent notification intent and re-publish the
        // post-commit signal to re-arm the next Scheduler trigger that may have
        // been lost between the original commit and the next schedule
        // (ROUTINE-3401 finding: the commit and the re-arm must not split a
        // crash; the projection runtime dedups the re-published occurrence).
        try {
          await deps.notificationWriter.enqueueRoutineOccurrenceRequested(notificationRequest);
          if (input.notificationOccurrenceKey != null && deps.temporaryOverrideStore != null) {
            await deps.temporaryOverrideStore.clearRoutineTemporaryOverride({
              identityId: input.identityId,
              routineId: input.routineId,
            });
          }
        } catch (error) {
          return { kind: 'retryable', error: serializeError(error) };
        }

        const nextEligibleAfterReplay =
          trigger.type === 'WallClock'
            ? computeRoutineNextEligibleOccurrence({
                routineId: input.routineId,
                engine: deps.recurrenceEngine,
                trigger,
                after: input.scheduledFor,
                temporaryOverride: snapshot.temporaryOverride,
              })
            : null;
        deps.publishOccurrenceCommitted?.({
          routineId: input.routineId,
          identityId: input.identityId,
          occurrenceKey: input.occurrenceKey,
          scheduledFor: input.scheduledFor,
        });

        return {
          kind: 'succeeded',
          occurrenceId: lease.occurrenceId,
          nextOccurrenceAt: nextEligibleAfterReplay
            ? Number(nextEligibleAfterReplay.occurrenceAt)
            : null,
          notificationRequested: true,
        };
      }

      const nextEligible =
        trigger.type === 'WallClock'
          ? computeRoutineNextEligibleOccurrence({
              routineId: input.routineId,
              engine: deps.recurrenceEngine,
              trigger,
              after: input.scheduledFor,
              temporaryOverride: snapshot.temporaryOverride,
            })
          : null;
      const nextOccurrenceAt = nextEligible ? Number(nextEligible.occurrenceAt) : null;

      try {
        // ROUTINE-3401 crash-window guard: the occurrence finalize AND the
        // durable notification intent commit atomically in ONE transaction.
        // Without the transaction a crash between them surfaces a committed
        // occurrence whose notification intent was never persisted.
        await deps.occurrenceStore.withOccurrenceTransaction(async (transaction) => {
          await deps.occurrenceStore.completeOccurrence(
            {
              occurrenceId: lease.occurrenceId,
              fencingToken: lease.fencingToken,
              ownerToken: lease.ownerToken,
              status: 'succeeded',
              history: {
                routineId: input.routineId,
                identityId: input.identityId,
                occurrenceKey: input.occurrenceKey,
                scheduledFor: input.scheduledFor,
                triggeredAt: nowMs,
                result: 'success',
                reason: null,
              },
              nextOccurrenceAt,
            },
            { transaction },
          );

          await deps.notificationWriter.enqueueRoutineOccurrenceRequested(notificationRequest, {
            transaction,
          });
        });
      } catch (error) {
        if (error instanceof LeaseFencingException) {
          return { kind: 'dead-letter', reason: 'fencing-rejected', error: error.message };
        }
        return { kind: 'retryable', error: serializeError(error) };
      }

      deps.publishOccurrenceCommitted?.({
        routineId: input.routineId,
        identityId: input.identityId,
        occurrenceKey: input.occurrenceKey,
        scheduledFor: input.scheduledFor,
      });

      return {
        kind: 'succeeded',
        occurrenceId: lease.occurrenceId,
        nextOccurrenceAt,
        notificationRequested: true,
      };
    },
  };
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Backward-compatible factory name for existing composition imports. */
export const createRoutineWallClockExecutionSource = createRoutineScheduleExecutionSource;
