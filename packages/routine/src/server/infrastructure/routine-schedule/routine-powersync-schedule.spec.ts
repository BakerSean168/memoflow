import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationRequestedWriterPort } from '@memoflow/notification-contracts';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import {
  createRoutinePowerSyncScheduleExecutionDeps,
  createRoutinePowerSyncScheduleProjectionSource,
} from '../powersync';
import { createRoutineScheduleExecutionSource } from './routine-schedule-execution-source';
import { createElapsedTrigger, createWallClockTrigger } from '../../domain/routine';
import { PowerSyncRoutineOccurrenceStore } from './routine-occurrence-store.powersync';

describe('Routine PowerSync Scheduler adapters', () => {
  const fixtures: Array<ReturnType<typeof createPowerSyncSqliteFixture>> = [];
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.close();
  });

  it('projects and durably executes an offline last-satisfied occurrence once', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const now = Date.parse('2026-10-30T12:01:00.000Z');
    const activatedAt = new Date(now - 60_000).toISOString();
    const trigger = createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' });
    await fixture.db.execute(
      `INSERT INTO routine_definitions
        (id, identity_id, name, description, enabled, trigger_json, activated_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`,
      [
        'routine-offline',
        'identity-1',
        'Stretch',
        'Stand and move.',
        JSON.stringify(trigger),
        activatedAt,
        activatedAt,
        activatedAt,
      ],
    );

    const requested: unknown[] = [];
    const requestedWriter = {
      enqueueNotificationRequested: async (input: unknown, options: unknown) => {
        requested.push({ input, options });
        return {};
      },
    } as unknown as NotificationRequestedWriterPort;
    const eventStore = createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
      notificationRequestedWriter: requestedWriter,
      now: () => now,
    });
    const projection = createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now,
    });
    const plan = await projection.buildRoutinePlan('routine-offline', 'identity-1');
    expect(plan.desired).toHaveLength(1);

    const intent = plan.desired[0]!;
    const execution = createRoutineScheduleExecutionSource(eventStore);
    const result = await execution.executeRoutineOccurrence({
      ...intent.payload,
      triggerKind: 'Elapsed',
    });

    expect(result).toMatchObject({ kind: 'succeeded', notificationRequested: true });
    expect(
      await fixture.db.get<{ status: string; resolution_state: string }>(
        `SELECT status, resolution_state FROM routine_occurrences WHERE identity_id = ? AND routine_id = ?`,
        ['identity-1', 'routine-offline'],
      ),
    ).toEqual({ status: 'succeeded', resolution_state: 'Open' });
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({
      input: {
        envelope: {
          source: 'routine',
          occurrenceKey: intent.payload.occurrenceKey,
          workflowKey: 'routine.intervention',
        },
      },
      options: { txClient: expect.any(Object) },
    });

    const restored = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now + 3_600_000,
    }).buildRoutinePlan('routine-offline', 'identity-1');
    expect(restored.desired).toEqual([]);
  });

  async function seedRoutine(
    fixture: ReturnType<typeof createPowerSyncSqliteFixture>,
    input: {
      readonly id: string;
      readonly identityId?: string;
      readonly enabled?: boolean;
      readonly trigger: unknown;
      readonly activatedAt: string;
    },
  ): Promise<void> {
    await fixture.db.execute(
      `INSERT INTO routine_definitions
        (id, identity_id, name, description, enabled, trigger_json, activated_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        input.id,
        input.identityId ?? 'identity-1',
        'Stretch',
        'Stand and move.',
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.trigger),
        input.activatedAt,
        input.activatedAt,
        input.activatedAt,
      ],
    );
  }

  function createRecordingWriter(): {
    readonly writer: NotificationRequestedWriterPort;
    readonly requested: unknown[];
  } {
    const requested: unknown[] = [];
    const writer = {
      enqueueNotificationRequested: async (input: unknown, options: unknown) => {
        requested.push({ input, options });
        return {};
      },
    } as unknown as NotificationRequestedWriterPort;
    return { writer, requested };
  }

  function idempotencyKeys(requested: readonly unknown[]): string[] {
    return [
      ...new Set(
        requested.map(
          (entry) =>
            (entry as { input: { envelope: { idempotencyKey: string } } }).input.envelope
              .idempotencyKey,
        ),
      ),
    ];
  }

  it('does not duplicate the occurrence or notification when an attempt is re-delivered after a restart', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const now = Date.parse('2026-10-30T12:01:00.000Z');
    await seedRoutine(fixture, {
      id: 'routine-redelivery',
      trigger: createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' }),
      activatedAt: new Date(now - 60_000).toISOString(),
    });
    const { writer, requested } = createRecordingWriter();
    const plan = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now,
    }).buildRoutinePlan('routine-redelivery', 'identity-1');
    const payload = { ...plan.desired[0]!.payload, triggerKind: 'Elapsed' as const };

    const first = createRoutineScheduleExecutionSource(
      createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
        notificationRequestedWriter: writer,
        now: () => now,
      }),
    );
    expect(await first.executeRoutineOccurrence(payload)).toMatchObject({ kind: 'succeeded' });

    // A fresh execution source over the same SQLite file models a restarted Main process
    // whose durable Scheduler re-delivers the attempt it could not acknowledge.
    const restarted = createRoutineScheduleExecutionSource(
      createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
        notificationRequestedWriter: writer,
        now: () => now + 5_000,
      }),
    );
    await restarted.executeRoutineOccurrence(payload);

    const rows = await fixture.db.getAll<{ status: string }>(
      `SELECT status FROM routine_occurrences WHERE identity_id = ? AND routine_id = ?`,
      ['identity-1', 'routine-redelivery'],
    );
    expect(rows).toEqual([{ status: 'succeeded' }]);
    // The replay re-confirms the same intent; NotificationRequested outbox writers
    // collapse it on the canonical envelope idempotencyKey, so the user is notified once.
    expect(idempotencyKeys(requested)).toHaveLength(1);
  });

  it('fences a crashed owner: an expired lease is reclaimed with a higher token and the stale commit is rejected', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const store = new PowerSyncRoutineOccurrenceStore(fixture.db);
    const scheduledFor = Date.parse('2026-10-30T12:00:00.000Z');
    const claim = {
      identityId: 'identity-1',
      routineId: 'routine-lease',
      occurrenceKey: 'routine-lease:occ-1',
      scheduledFor,
      triggerKind: 'Elapsed' as const,
      claimedAt: scheduledFor,
      leaseExpiresAt: scheduledFor + 30_000,
    };
    const crashed = await store.claimOccurrence(claim as never);
    const stillLeased = await store.claimOccurrence({
      ...claim,
      claimedAt: scheduledFor + 10_000,
      leaseExpiresAt: scheduledFor + 40_000,
    } as never);
    expect(stillLeased.fencingToken).toBe(crashed.fencingToken);

    const recovered = await store.claimOccurrence({
      ...claim,
      claimedAt: scheduledFor + 31_000,
      leaseExpiresAt: scheduledFor + 61_000,
    } as never);
    expect(recovered.fencingToken).toBeGreaterThan(crashed.fencingToken);

    await expect(
      store.completeOccurrence({
        occurrenceId: crashed.occurrenceId,
        ownerToken: crashed.ownerToken,
        fencingToken: crashed.fencingToken,
        status: 'succeeded',
        nextOccurrenceAt: null,
        history: { triggeredAt: scheduledFor + 32_000 },
      } as never),
    ).rejects.toThrow(/no longer current/);
  });

  it('only projects enabled routines that belong to the requested profile identity', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const now = Date.parse('2026-10-30T12:01:00.000Z');
    const trigger = createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' });
    const activatedAt = new Date(now - 60_000).toISOString();
    await seedRoutine(fixture, { id: 'routine-a', identityId: 'identity-a', trigger, activatedAt });
    await seedRoutine(fixture, {
      id: 'routine-disabled',
      identityId: 'identity-a',
      enabled: false,
      trigger,
      activatedAt,
    });
    const projection = createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now,
    });

    expect((await projection.buildRoutinePlan('routine-a', 'identity-a')).desired).toHaveLength(1);
    // After a Profile switch the Scheduler must not project another identity's routine.
    expect((await projection.buildRoutinePlan('routine-a', 'identity-b')).desired).toEqual([]);
    expect((await projection.buildRoutinePlan('routine-disabled', 'identity-a')).desired).toEqual(
      [],
    );
  });

  it('projects a WallClock routine offline in its own time zone on both sides of the DST fall-back', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    for (const startDate of ['2026-10-31', '2026-11-01']) {
      await seedRoutine(fixture, {
        id: `routine-wall-${startDate}`,
        trigger: createWallClockTrigger({
          localTime: '09:00',
          timeZone: 'America/Los_Angeles',
          recurrence: { startDate, frequency: 'daily' } as never,
        }),
        activatedAt: '2026-10-30T00:00:00.000Z',
      });
    }

    const beforeDst = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => Date.parse('2026-10-31T10:00:00.000Z'),
    }).buildRoutinePlan('routine-wall-2026-10-31', 'identity-1');
    // 09:00 PDT (UTC-7).
    expect(beforeDst.desired.map((intent) => intent.payload.scheduledFor)).toEqual([
      Date.parse('2026-10-31T16:00:00.000Z'),
    ]);

    const afterDst = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => Date.parse('2026-11-01T10:00:00.000Z'),
    }).buildRoutinePlan('routine-wall-2026-11-01', 'identity-1');
    // 09:00 PST (UTC-8) on the day of the 2026-11-01 fall-back.
    expect(afterDst.desired.map((intent) => intent.payload.scheduledFor)).toEqual([
      Date.parse('2026-11-01T17:00:00.000Z'),
    ]);
  });

  it('converges with an occurrence the cloud host already executed and synced down', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const now = Date.parse('2026-10-30T12:01:00.000Z');
    await seedRoutine(fixture, {
      id: 'routine-dual',
      trigger: createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' }),
      activatedAt: new Date(now - 60_000).toISOString(),
    });
    const plan = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now,
    }).buildRoutinePlan('routine-dual', 'identity-1');
    const payload = { ...plan.desired[0]!.payload, triggerKind: 'Elapsed' as const };

    // The Web/API host already ran this occurrence and PowerSync replayed its row
    // (same canonical idempotency key) into the local DB before the Desktop attempt.
    const cloud = createRecordingWriter();
    await createRoutineScheduleExecutionSource(
      createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
        notificationRequestedWriter: cloud.writer,
        now: () => now,
      }),
    ).executeRoutineOccurrence(payload);

    const desktop = createRecordingWriter();
    await createRoutineScheduleExecutionSource(
      createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
        notificationRequestedWriter: desktop.writer,
        now: () => now + 1_000,
      }),
    ).executeRoutineOccurrence(payload);

    expect(
      await fixture.db.getAll(`SELECT id FROM routine_occurrences WHERE routine_id = ?`, [
        'routine-dual',
      ]),
    ).toHaveLength(1);
    expect(idempotencyKeys([...cloud.requested, ...desktop.requested])).toHaveLength(1);
  });
});
