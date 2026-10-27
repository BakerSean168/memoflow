import { describe, expect, it } from 'vitest';
import type { ScheduledInvocationContext } from '@memoflow/schedule-contracts';
import { createRoutineWallClockScheduledHandler } from '../routine-wall-clock-scheduled-handler';
import type {
  RoutineScheduleExecutionOutcome,
  RoutineScheduleExecutionSource,
} from '../routine-schedule-execution-source';
import {
  ROUTINE_SCHEDULING_OWNER_TYPE,
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  buildRoutineWallClockSchedulingKey,
} from '../routine-schedule-contract';
import { FIXTURE_F, fixtureOccurrenceKey } from './test-support';

function createContext(
  overrides?: Partial<ScheduledInvocationContext>,
): ScheduledInvocationContext {
  return {
    identityId: FIXTURE_F.identityId,
    owner: {
      identityId: FIXTURE_F.identityId,
      type: ROUTINE_SCHEDULING_OWNER_TYPE,
      id: FIXTURE_F.routineId,
    },
    schedulingKey: buildRoutineWallClockSchedulingKey(FIXTURE_F.routineId, fixtureOccurrenceKey()),
    handlerKey: ROUTINE_WALLCLOCK_HANDLER_KEY,
    runAt: FIXTURE_F.firstOccurrenceAt,
    payloadVersion: ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
    payload: {
      routineId: FIXTURE_F.routineId,
      identityId: FIXTURE_F.identityId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
    },
    ...overrides,
  };
}

function createScriptedSource(
  outcome: RoutineScheduleExecutionOutcome,
): RoutineScheduleExecutionSource {
  return {
    async executeRoutineOccurrence() {
      return outcome;
    },
  };
}

describe('createRoutineWallClockScheduledHandler (ROUTINE-3401)', () => {
  it('registers the neutral handler key with strict payload validation', () => {
    const registration = createRoutineWallClockScheduledHandler({
      executionSource: createScriptedSource({
        kind: 'succeeded',
        occurrenceId: 'oc-1',
        nextOccurrenceAt: null,
        notificationRequested: true,
      }),
    });
    expect(registration.handlerKey).toBe(ROUTINE_WALLCLOCK_HANDLER_KEY);
    expect(registration.payloadVersion).toBe(ROUTINE_WALLCLOCK_PAYLOAD_VERSION);
    expect(registration.validatePayload(createContext().payload)).toEqual(createContext().payload);
    expect(() =>
      registration.validatePayload({ ...createContext().payload, scheduledFor: undefined }),
    ).toThrow(TypeError);
  });

  it('maps a fulfilled occurrence to a succeeded result', async () => {
    const registration = createRoutineWallClockScheduledHandler({
      executionSource: createScriptedSource({
        kind: 'succeeded',
        occurrenceId: 'oc-1',
        nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
        notificationRequested: true,
      }),
    });
    const result = await registration.handler.execute(createContext());
    expect(result).toEqual({
      status: 'succeeded',
      result: {
        occurrenceId: 'oc-1',
        nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
        notificationRequested: true,
      },
    });
  });

  it('maps a skip to a skipped result without retry semantics', async () => {
    const registration = createRoutineWallClockScheduledHandler({
      executionSource: createScriptedSource({
        kind: 'skipped',
        reason: 'revision-drifted',
        occurrenceId: null,
      }),
    });
    const result = await registration.handler.execute(createContext());
    expect(result).toEqual({
      status: 'skipped',
      reason: 'revision-drifted',
      result: { occurrenceId: null },
    });
  });

  it('maps a transient failure to a retryable HANDLER_EXECUTION_FAILED', async () => {
    const registration = createRoutineWallClockScheduledHandler({
      executionSource: createScriptedSource({ kind: 'retryable', error: 'outbox closed' }),
    });
    const result = await registration.handler.execute(createContext());
    expect(result).toEqual({
      status: 'retryable',
      failure: { code: 'HANDLER_EXECUTION_FAILED', message: 'outbox closed', retryable: true },
    });
  });

  it('maps a fencing rejection to a non-retryable dead-letter', async () => {
    const registration = createRoutineWallClockScheduledHandler({
      executionSource: createScriptedSource({
        kind: 'dead-letter',
        reason: 'fencing-rejected',
        error: 'Stale fencing token',
      }),
    });
    const result = await registration.handler.execute(createContext());
    expect(result).toEqual({
      status: 'dead_letter',
      failure: {
        code: 'DISPATCH_STATE_CONFLICT',
        message: 'Stale fencing token',
        retryable: false,
      },
      result: { reason: 'fencing-rejected' },
    });
  });
});
