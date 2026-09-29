import type { ScheduledHandlerRegistration } from '@memoflow/contracts/schedule';
import {
  ROUTINE_ELAPSED_HANDLER_KEY,
  ROUTINE_ELAPSED_PAYLOAD_VERSION,
  parseRoutineElapsedPayload,
  type RoutineElapsedOccurrencePayload,
} from './routine-schedule-contract';
import type { RoutineScheduleExecutionSource } from './routine-schedule-execution-source';

export function createRoutineElapsedScheduledHandler(deps: {
  readonly executionSource: RoutineScheduleExecutionSource;
}): ScheduledHandlerRegistration<RoutineElapsedOccurrencePayload> {
  return {
    handlerKey: ROUTINE_ELAPSED_HANDLER_KEY,
    payloadVersion: ROUTINE_ELAPSED_PAYLOAD_VERSION,
    validatePayload: parseRoutineElapsedPayload,
    handler: {
      async execute(context) {
        const outcome = await deps.executionSource.executeRoutineOccurrence({
          identityId: context.payload.identityId,
          routineId: context.payload.routineId,
          occurrenceKey: context.payload.occurrenceKey,
          ...(context.payload.notificationOccurrenceKey
            ? { notificationOccurrenceKey: context.payload.notificationOccurrenceKey }
            : {}),
          triggerKind: 'Elapsed',
          scheduledFor: context.payload.scheduledFor,
          dueAt: context.payload.dueAt,
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
              result: { occurrenceId: outcome.occurrenceId ?? null },
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
