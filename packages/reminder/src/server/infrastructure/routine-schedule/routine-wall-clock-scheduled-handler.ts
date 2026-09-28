import type { ScheduledHandlerRegistration } from '@memoflow/contracts/schedule';
import {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  parseRoutineWallClockPayload,
  type RoutineWallClockOccurrencePayload,
} from './routine-schedule-contract';
import type { RoutineScheduleExecutionSource } from './routine-schedule-execution-source';

/**
 * Neutral ScheduledHandler registration for the durable Routine wall-clock
 * lane. Mapping contract:
 * - fulfilled occurrence  -> 'succeeded'
 * - legitimately not runnable -> 'skipped' (task removed, no retry)
 * - corrupt/stale payload -> dead_letter WITHOUT retry (fencing rejected)
 * - transient infrastructure error -> retryable
 */
export function createRoutineWallClockScheduledHandler(deps: {
  readonly executionSource: RoutineScheduleExecutionSource;
}): ScheduledHandlerRegistration<RoutineWallClockOccurrencePayload> {
  return {
    handlerKey: ROUTINE_WALLCLOCK_HANDLER_KEY,
    payloadVersion: ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
    validatePayload: parseRoutineWallClockPayload,
    handler: {
      async execute(context) {
        const outcome = await deps.executionSource.executeRoutineOccurrence({
          identityId: context.payload.identityId,
          routineId: context.payload.routineId,
          occurrenceKey: context.payload.occurrenceKey,
          triggerKind: 'WallClock',
          scheduledFor: context.payload.scheduledFor,
          sourceRevision: context.payload.sourceRevision,
        });

        switch (outcome.kind) {
          case 'succeeded':
            return {
              status: 'succeeded',
              result: {
                occurrenceId: outcome.occurrenceId,
                nextOccurrenceAt: outcome.nextOccurrenceAt ?? null,
                notificationRequested: outcome.notificationRequested,
              },
            };
          case 'skipped':
            return {
              status: 'skipped',
              reason: outcome.reason,
              result: {
                occurrenceId: outcome.occurrenceId ?? null,
              },
            };
          case 'retryable':
            return {
              status: 'retryable',
              failure: {
                code: 'HANDLER_EXECUTION_FAILED',
                message: outcome.error,
                retryable: true,
              },
            };
          case 'dead-letter':
            return {
              status: 'dead_letter',
              failure: {
                code: 'DISPATCH_STATE_CONFLICT',
                message: outcome.error,
                retryable: false,
              },
              result: { reason: outcome.reason },
            };
        }
      },
    },
  };
}
