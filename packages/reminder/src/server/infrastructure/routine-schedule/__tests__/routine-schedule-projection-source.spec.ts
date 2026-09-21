import { describe, expect, it } from 'vitest';
import { createRecurrenceEngine } from '@memoflow/time';
import {
  createRoutineScheduleProjectionSource,
  type RoutineScheduleProjectionSource,
  type RoutineScheduleSnapshot,
  type RoutineScheduleStateReader,
} from '../routine-schedule-projection-source';
import {
  ROUTINE_SCHEDULING_OWNER_TYPE,
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  buildRoutineWallClockSchedulingKey,
} from '../routine-schedule-contract';
import {
  createElapsedTrigger,
  createTemporaryOverride,
  type RoutineTemporaryOverride,
} from '../../../domain/routine';
import {
  FIXTURE_F,
  buildFixtureFRoutine,
  fixtureOccurrenceKey,
  fixtureTrigger,
} from './test-support';

function createReader(options?: {
  snapshot?: RoutineScheduleSnapshot | null;
}): RoutineScheduleStateReader {
  const snapshot: RoutineScheduleSnapshot | null =
    options?.snapshot === undefined
      ? { definition: buildFixtureFRoutine(), durableProfileGateOpen: true }
      : (options.snapshot ?? null);
  return {
    async readRoutineScheduleSnapshot() {
      return snapshot;
    },
    async listRoutineRefs() {
      return [];
    },
  };
}

function createSource(
  reader: RoutineScheduleStateReader,
  options?: { now?: number },
): RoutineScheduleProjectionSource {
  return createRoutineScheduleProjectionSource({
    reader,
    recurrenceEngine: createRecurrenceEngine(),
    now: () => options?.now ?? Date.parse('2026-08-25T07:00:00.000Z'),
  });
}

describe('createRoutineScheduleProjectionSource (ROUTINE-3401)', () => {
  it('projects exactly one durable intent at the canonical 23:30 Asia/Shanghai instant', async () => {
    const source = createSource(createReader());
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);

    expect(plan.owner.type).toBe(ROUTINE_SCHEDULING_OWNER_TYPE);
    expect(plan.owner.id).toBe(FIXTURE_F.routineId);
    expect(plan.desired).toHaveLength(1);

    const intent = plan.desired[0];
    expect(intent.handlerKey).toBe(ROUTINE_WALLCLOCK_HANDLER_KEY);
    expect(intent.payloadVersion).toBe(ROUTINE_WALLCLOCK_PAYLOAD_VERSION);
    expect(intent.runAt).toBe(FIXTURE_F.firstOccurrenceAt);
    expect(intent.schedulingKey).toBe(
      buildRoutineWallClockSchedulingKey(FIXTURE_F.routineId, fixtureOccurrenceKey()),
    );
    expect(intent.payload).toEqual({
      routineId: FIXTURE_F.routineId,
      identityId: FIXTURE_F.identityId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
    });
  });

  it('projects nothing when every durable Profile/Membership path is gated off', async () => {
    const source = createSource(
      createReader({
        snapshot: { definition: buildFixtureFRoutine(), durableProfileGateOpen: false },
      }),
    );
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
  });

  it('projects nothing for a disabled routine (owner key stays canonical)', async () => {
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine({ enabled: false }),
          durableProfileGateOpen: true,
        },
      }),
    );
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
    expect(plan.owner.id).toBe(FIXTURE_F.routineId);
  });

  it('projects nothing for local-runtime triggers (Elapsed stays Wave 4)', async () => {
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine({
            trigger: createElapsedTrigger({ durationMs: 60_000 }),
          }),
          durableProfileGateOpen: true,
        },
      }),
    );
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
  });

  it('projects nothing when the snapshot is missing', async () => {
    const source = createSource(createReader({ snapshot: null }));
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
  });

  it('projects nothing once the recurrence count is exhausted', async () => {
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine({ trigger: fixtureTrigger({ count: 1 }) }),
          durableProfileGateOpen: true,
        },
      }),
      { now: Date.parse('2026-08-26T00:00:00.000Z') },
    );
    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
  });

  it('shifts the durable invocation past an active snooze to the next eligible occurrence', async () => {
    const snooze = createSnoozeFixture();
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine(),
          durableProfileGateOpen: true,
          temporaryOverride: snooze,
        },
      }),
    );

    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);

    expect(plan.desired).toHaveLength(1);
    expect(plan.desired[0]!.runAt).toBe(FIXTURE_F.nextOccurrenceAt);
    expect(plan.desired[0]!.schedulingKey).toBe(
      buildRoutineWallClockSchedulingKey(
        FIXTURE_F.routineId,
        `routine:${FIXTURE_F.routineId}:oc:${FIXTURE_F.nextOccurrenceAt}`,
      ),
    );
  });

  it('projects nothing while a suppress window covers every remaining candidate occurrence', async () => {
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine({ trigger: fixtureTrigger({ count: 3 }) }),
          durableProfileGateOpen: true,
          temporaryOverride: createTemporaryOverride({
            suppressUntil: Date.parse('2026-08-28T00:00:00.000Z'),
            expiresAt: Date.parse('2026-08-28T00:00:00.000Z'),
            reason: 'user suppress',
            source: 'user',
          }),
        },
      }),
    );

    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);
    expect(plan.desired).toEqual([]);
  });

  it('treats an expired snooze as neutral and restores the canonical occurrence', async () => {
    const source = createSource(
      createReader({
        snapshot: {
          definition: buildFixtureFRoutine(),
          durableProfileGateOpen: true,
          temporaryOverride: createTemporaryOverride({
            snoozeUntil: Date.parse('2026-08-24T16:00:00.000Z'),
            expiresAt: Date.parse('2026-08-24T23:00:00.000Z'),
            reason: 'expired snooze',
            source: 'user',
          }),
        },
      }),
    );

    const plan = await source.buildRoutinePlan(FIXTURE_F.routineId, FIXTURE_F.identityId);

    expect(plan.desired).toHaveLength(1);
    expect(plan.desired[0]!.runAt).toBe(FIXTURE_F.firstOccurrenceAt);
    expect(plan.desired[0]!.schedulingKey).toBe(
      buildRoutineWallClockSchedulingKey(FIXTURE_F.routineId, fixtureOccurrenceKey()),
    );
  });
});

function createSnoozeFixture(): RoutineTemporaryOverride {
  return createTemporaryOverride({
    snoozeUntil: Date.parse('2026-08-25T16:00:00.000Z'),
    expiresAt: Date.parse('2026-08-25T16:00:00.000Z'),
    reason: 'snoozed during evening wind-down',
    source: 'user',
  });
}
