import { describe, expect, it } from 'vitest';
import type { ScheduledInvocationContext } from '@memoflow/contracts/schedule';
import { createRoutineElapsedScheduledHandler } from '../routine-elapsed-scheduled-handler';
import type {
  RoutineScheduleExecutionOutcome,
  RoutineScheduleExecutionSource,
} from '../routine-schedule-execution-source';
import {
  ROUTINE_ELAPSED_HANDLER_KEY,
  ROUTINE_ELAPSED_PAYLOAD_VERSION,
} from '../routine-schedule-contract';

function scripted(outcome: RoutineScheduleExecutionOutcome): RoutineScheduleExecutionSource {
  return {
    async executeRoutineOccurrence() {
      return outcome;
    },
  };
}

function context(): ScheduledInvocationContext<Record<string, unknown>> {
  return {
    identityId: 'identity-1',
    owner: { identityId: 'identity-1', type: 'routine.routine', id: 'routine-1' },
    schedulingKey: 'routine.elapsed:routine-1:occurrence-1',
    handlerKey: ROUTINE_ELAPSED_HANDLER_KEY,
    runAt: 2_000,
    payloadVersion: ROUTINE_ELAPSED_PAYLOAD_VERSION,
    payload: {
      routineId: 'routine-1',
      identityId: 'identity-1',
      occurrenceKey: 'occurrence-1',
      scheduledFor: 2_000,
      dueAt: 1_500,
      sourceRevision: 3,
    },
    sourceRevision: 3,
    attempt: 1,
  } as unknown as ScheduledInvocationContext<Record<string, unknown>>;
}

describe('createRoutineElapsedScheduledHandler', () => {
  it('registers the elapsed handler contract and forwards dueAt semantics', async () => {
    const calls: unknown[] = [];
    const registration = createRoutineElapsedScheduledHandler({
      executionSource: {
        async executeRoutineOccurrence(input) {
          calls.push(input);
          return {
            kind: 'succeeded',
            occurrenceId: 'occ-1',
            nextOccurrenceAt: null,
            notificationRequested: true,
          };
        },
      },
    });

    expect(registration.handlerKey).toBe(ROUTINE_ELAPSED_HANDLER_KEY);
    expect(registration.payloadVersion).toBe(ROUTINE_ELAPSED_PAYLOAD_VERSION);
    const validated = registration.validatePayload(context().payload);
    expect(validated).toMatchObject({ dueAt: 1_500, scheduledFor: 2_000 });

    const result = await registration.handler.execute(
      context() as ScheduledInvocationContext<typeof validated>,
    );
    expect(calls).toEqual([
      {
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: 'occurrence-1',
        triggerKind: 'Elapsed',
        scheduledFor: 2_000,
        dueAt: 1_500,
        sourceRevision: 3,
      },
    ]);
    expect(result).toMatchObject({
      status: 'succeeded',
      result: { occurrenceId: 'occ-1', notificationRequested: true },
    });
  });

  it('maps retryable execution failures without reclassifying them', async () => {
    const registration = createRoutineElapsedScheduledHandler({
      executionSource: scripted({ kind: 'retryable', error: 'temporary outage' }),
    });
    const validated = registration.validatePayload(context().payload);

    await expect(
      registration.handler.execute(context() as ScheduledInvocationContext<typeof validated>),
    ).resolves.toMatchObject({
      status: 'retryable',
      failure: { code: 'HANDLER_EXECUTION_FAILED', retryable: true },
    });
  });
});
