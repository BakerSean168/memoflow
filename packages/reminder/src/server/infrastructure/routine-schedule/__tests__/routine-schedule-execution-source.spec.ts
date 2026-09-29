import { describe, expect, it, vi } from 'vitest';
import { LeaseFencingException } from '@memoflow/contracts/reliable-messaging';
import { createRecurrenceEngine } from '@memoflow/time';
import {
  createElapsedTrigger,
  createSnoozeOverride,
  type DurableElapsedOccurrenceSnapshot,
  type RoutineTemporaryOverride,
} from '../../../domain/routine';
import {
  createRoutineWallClockExecutionSource,
  ROUTINE_OCCURRENCE_LEASE_MS,
  type RoutineScheduleExecutionDeps,
  type RoutineScheduleExecutionInput,
  type RoutineScheduleExecutionSource,
} from '../routine-schedule-execution-source';
import { createInMemoryRoutineOccurrenceStore } from '../routine-occurrence-store.in-memory';
import {
  createInMemoryRoutineNotificationWriter,
  type RoutineOccurrenceNotificationWriterPort,
} from '../routine-occurrence-notification-writer';
import type { RoutineOccurrenceStore } from '../../../domain/ports/routine-occurrence-store.port';
import { FIXTURE_F, buildFixtureFRoutine, fixtureOccurrenceKey } from './test-support';

function createExecutionInput(
  overrides?: Partial<RoutineScheduleExecutionInput>,
): RoutineScheduleExecutionInput {
  return {
    identityId: FIXTURE_F.identityId,
    routineId: FIXTURE_F.routineId,
    occurrenceKey: fixtureOccurrenceKey(),
    scheduledFor: FIXTURE_F.firstOccurrenceAt,
    sourceRevision: FIXTURE_F.version,
    ...overrides,
  };
}

interface Deployment {
  source: RoutineScheduleExecutionSource;
  store: RoutineOccurrenceStore;
  writer: ReturnType<typeof createInMemoryRoutineNotificationWriter>;
  published: Array<{
    routineId: string;
    identityId: string;
    occurrenceKey: string;
    scheduledFor: number;
  }>;
  nowMs: () => number;
  setNow: (ms: number) => void;
  clearTemporaryOverride: ReturnType<typeof vi.fn>;
}

function createDeployment(options?: {
  globalEnabled?: boolean;
  durableProfileGateOpen?: boolean;
  snapshot?: ReturnType<typeof buildFixtureFRoutine> | null;
  temporaryOverride?: RoutineTemporaryOverride | null;
  elapsedOccurrences?: readonly DurableElapsedOccurrenceSnapshot[];
  writer?: RoutineOccurrenceNotificationWriterPort;
  now?: number;
}): Deployment {
  let nowMs = options?.now ?? Date.parse('2026-08-25T16:00:00.000Z');
  const recurrenceEngine = createRecurrenceEngine();
  const reader = {
    async readRoutineScheduleSnapshot() {
      const definition =
        options?.snapshot === undefined ? buildFixtureFRoutine() : options.snapshot;
      if (definition == null) return null;
      return {
        definition,
        globalEnabled: options?.globalEnabled ?? true,
        durableProfileGateOpen: options?.durableProfileGateOpen ?? true,
        temporaryOverride: options?.temporaryOverride ?? null,
        elapsedOccurrences: options?.elapsedOccurrences ?? [],
      };
    },
  };
  const store = createInMemoryRoutineOccurrenceStore({ now: () => nowMs });
  const writer = options?.writer ?? createInMemoryRoutineNotificationWriter({ now: () => nowMs });
  const published: Deployment['published'] = [];
  const clearTemporaryOverride = vi.fn().mockResolvedValue(undefined);
  const source = createRoutineWallClockExecutionSource({
    reader,
    occurrenceStore: store,
    notificationWriter: writer,
    recurrenceEngine,
    now: () => nowMs,
    temporaryOverrideStore: {
      async findRoutineTemporaryOverride() {
        return options?.temporaryOverride ?? null;
      },
      async setRoutineTemporaryOverride() {},
      clearRoutineTemporaryOverride: clearTemporaryOverride,
    },
    publishOccurrenceCommitted: (event) => published.push(event),
  } satisfies RoutineScheduleExecutionDeps);

  return {
    source,
    store,
    writer,
    published,
    nowMs: () => nowMs,
    setNow: (ms) => {
      nowMs = ms;
    },
    clearTemporaryOverride,
  };
}

describe('createRoutineWallClockExecutionSource (ROUTINE-3401)', () => {
  it('executes a scheduler-owned Elapsed occurrence and emits canonical notification truth', async () => {
    const activatedAt = Date.parse('2026-08-25T15:00:00.000Z');
    const dueAt = activatedAt + 50 * 60_000;
    const occurrenceKey =
      'routine:' + FIXTURE_F.routineId + ':elapsed:activation-' + activatedAt + ':1';
    const deps = createDeployment({
      snapshot: buildFixtureFRoutine({
        trigger: createElapsedTrigger({
          durationMs: 50 * 60_000,
          anchor: 'last-satisfied',
        }),
        activatedAt: new Date(activatedAt),
      }),
      now: dueAt + 1,
    });

    const outcome = await deps.source.executeRoutineOccurrence(
      createExecutionInput({
        occurrenceKey,
        triggerKind: 'Elapsed',
        scheduledFor: dueAt,
        dueAt,
      }),
    );

    expect(outcome).toMatchObject({
      kind: 'succeeded',
      nextOccurrenceAt: null,
      notificationRequested: true,
    });
    expect(deps.writer.rows).toHaveLength(1);
    expect(deps.writer.rows[0].envelope).toMatchObject({
      workflowKey: 'routine.intervention',
      occurrenceKey,
    });
    expect(deps.published).toEqual([
      {
        routineId: FIXTURE_F.routineId,
        identityId: FIXTURE_F.identityId,
        occurrenceKey,
        scheduledFor: dueAt,
      },
    ]);
  });

  it('re-presents the same open Elapsed occurrence once after snooze and consumes the override', async () => {
    const activatedAt = Date.parse('2026-08-25T15:00:00.000Z');
    const originalDueAt = activatedAt + 50 * 60_000;
    const snoozeUntil = originalDueAt + 10 * 60_000;
    const occurrenceKey =
      'routine:' + FIXTURE_F.routineId + ':elapsed:activation-' + activatedAt + ':1';
    const notificationOccurrenceKey = occurrenceKey + ':snooze:' + snoozeUntil;
    const snooze = createSnoozeOverride({
      now: originalDueAt,
      durationMs: 10 * 60_000,
      reason: 'user snoozed',
    });
    const deps = createDeployment({
      snapshot: buildFixtureFRoutine({
        trigger: createElapsedTrigger({
          durationMs: 50 * 60_000,
          anchor: 'last-satisfied',
        }),
        activatedAt: new Date(activatedAt),
      }),
      temporaryOverride: snooze,
      elapsedOccurrences: [
        {
          occurrenceKey,
          sourceRevision: String(FIXTURE_F.version),
          resolutionState: 'Open',
          resolvedAt: null,
        },
      ],
      now: snoozeUntil + 1,
    });

    deps.setNow(originalDueAt);
    const lease = await deps.store.claimOccurrence({
      identityId: FIXTURE_F.identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      triggerKind: 'Elapsed',
      scheduledFor: originalDueAt,
      becameDueAt: originalDueAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt: originalDueAt,
      leaseExpiresAt: originalDueAt + ROUTINE_OCCURRENCE_LEASE_MS,
    });
    await deps.store.completeOccurrence({
      occurrenceId: lease.occurrenceId,
      fencingToken: lease.fencingToken,
      ownerToken: lease.ownerToken,
      status: 'succeeded',
      history: {
        routineId: FIXTURE_F.routineId,
        identityId: FIXTURE_F.identityId,
        occurrenceKey,
        scheduledFor: originalDueAt,
        triggeredAt: originalDueAt,
        result: 'success',
        reason: null,
      },
      nextOccurrenceAt: null,
    });
    deps.setNow(snoozeUntil + 1);

    const outcome = await deps.source.executeRoutineOccurrence(
      createExecutionInput({
        occurrenceKey,
        notificationOccurrenceKey,
        triggerKind: 'Elapsed',
        scheduledFor: snoozeUntil,
        dueAt: snoozeUntil,
      }),
    );

    expect(outcome).toMatchObject({
      kind: 'succeeded',
      nextOccurrenceAt: null,
      notificationRequested: true,
    });
    expect(deps.writer.rows).toHaveLength(1);
    expect(deps.writer.rows[0].envelope).toMatchObject({
      occurrenceKey: notificationOccurrenceKey,
      actions: expect.arrayContaining([
        expect.objectContaining({
          actionKey: 'complete',
          owner: { type: 'routine-occurrence', id: occurrenceKey },
        }),
      ]),
    });
    expect(deps.clearTemporaryOverride).toHaveBeenCalledWith({
      identityId: FIXTURE_F.identityId,
      routineId: FIXTURE_F.routineId,
    });
    expect(deps.published).toEqual([
      {
        routineId: FIXTURE_F.routineId,
        identityId: FIXTURE_F.identityId,
        occurrenceKey,
        scheduledFor: snoozeUntil,
      },
    ]);
  });

  it('rejects a forged snooze wake-up that does not match the durable override', async () => {
    const activatedAt = Date.parse('2026-08-25T15:00:00.000Z');
    const occurrenceKey =
      'routine:' + FIXTURE_F.routineId + ':elapsed:activation-' + activatedAt + ':1';
    const snooze = createSnoozeOverride({
      now: activatedAt + 50 * 60_000,
      durationMs: 10 * 60_000,
      reason: 'user snoozed',
    });
    const deps = createDeployment({
      snapshot: buildFixtureFRoutine({
        trigger: createElapsedTrigger({ durationMs: 50 * 60_000 }),
        activatedAt: new Date(activatedAt),
      }),
      temporaryOverride: snooze,
      elapsedOccurrences: [
        {
          occurrenceKey,
          sourceRevision: String(FIXTURE_F.version),
          resolutionState: 'Open',
          resolvedAt: null,
        },
      ],
    });

    const outcome = await deps.source.executeRoutineOccurrence(
      createExecutionInput({
        occurrenceKey,
        notificationOccurrenceKey: occurrenceKey + ':snooze:123',
        triggerKind: 'Elapsed',
        scheduledFor: 123,
        dueAt: 123,
      }),
    );

    expect(outcome).toEqual({
      kind: 'skipped',
      reason: 'no-eligible-occurrence',
      occurrenceId: null,
    });
    expect(deps.writer.rows).toHaveLength(0);
    expect(deps.clearTemporaryOverride).not.toHaveBeenCalled();
  });

  it('commits the occurrence once, then advances nextOccurrenceAt to the following day', async () => {
    const deps = createDeployment();
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());

    expect(outcome.kind).toBe('succeeded');
    if (outcome.kind !== 'succeeded') return;
    expect(outcome.occurrenceId).toBeTruthy();
    expect(outcome.nextOccurrenceAt).toBe(FIXTURE_F.nextOccurrenceAt);
    expect(outcome.notificationRequested).toBe(true);

    // Exactly one durable notification envelope, keyed idempotently.
    expect(deps.writer.rows).toHaveLength(1);
    expect(deps.writer.rows[0].envelope.workflowKey).toBe('routine.intervention');
    expect(deps.writer.rows[0].envelope.idempotencyKey).toContain(fixtureOccurrenceKey());
    expect(deps.writer.rows[0].envelope.source).toBe('routine');

    // Post-commit signal published once for the projection runtime.
    expect(deps.published).toHaveLength(1);
    expect(deps.published[0]).toEqual({
      routineId: FIXTURE_F.routineId,
      identityId: FIXTURE_F.identityId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
    });

    // The commit is durable: claiming again reports the terminal state.
    const lease = await deps.store.claimOccurrence({
      identityId: FIXTURE_F.identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt: deps.nowMs(),
      leaseExpiresAt: deps.nowMs() + ROUTINE_OCCURRENCE_LEASE_MS,
    });
    expect(lease.alreadyFinalized).toBe(true);
  });

  it('replays a committed occurrence idempotently and re-arms the next trigger', async () => {
    const deps = createDeployment();
    const input = createExecutionInput();
    const first = await deps.source.executeRoutineOccurrence(input);
    expect(first.kind).toBe('succeeded');

    // Crash/retry replay of the exact same occurrence after the commit landed.
    const replay = await deps.source.executeRoutineOccurrence(input);
    expect(replay.kind).toBe('succeeded');
    if (replay.kind !== 'succeeded') return;
    expect(replay.occurrenceId).toBe(first.kind === 'succeeded' ? first.occurrenceId : null);
    // The notification is still idempotent (exactly one durable envelope)...
    expect(replay.notificationRequested).toBe(true);
    expect(deps.writer.rows).toHaveLength(1);

    // ...but the post-commit signal is published again so the projection
    // runtime re-arms the next Scheduler trigger that a crash between the
    // original commit and the next schedule would otherwise have lost.
    expect(replay.nextOccurrenceAt).toBe(FIXTURE_F.nextOccurrenceAt);
    expect(deps.published).toHaveLength(2);
    expect(deps.published[1]).toEqual({
      routineId: FIXTURE_F.routineId,
      identityId: FIXTURE_F.identityId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
    });
  });

  it('takes over an expired lease with a higher fencing token and commits', async () => {
    const deps = createDeployment();
    const occurredAt = FIXTURE_F.firstOccurrenceAt + 1;
    deps.setNow(occurredAt);

    // Attempt A claims, then the process dies before commit.
    const leaseA = await deps.store.claimOccurrence({
      identityId: FIXTURE_F.identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt: deps.nowMs(),
      leaseExpiresAt: deps.nowMs() + ROUTINE_OCCURRENCE_LEASE_MS,
    });
    expect(leaseA.fencingToken).toBe(1);

    // Attempt B claims after the lease has expired and advances the fence.
    deps.setNow(occurredAt + ROUTINE_OCCURRENCE_LEASE_MS + 1);
    const leaseB = await deps.store.claimOccurrence({
      identityId: FIXTURE_F.identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: fixtureOccurrenceKey(),
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt: deps.nowMs(),
      leaseExpiresAt: deps.nowMs() + ROUTINE_OCCURRENCE_LEASE_MS,
    });
    expect(leaseB.fencingToken).toBe(2);

    // A stale commit from attempt A is rejected.
    await expect(
      deps.store.completeOccurrence({
        occurrenceId: leaseA.occurrenceId,
        fencingToken: leaseA.fencingToken,
        ownerToken: leaseA.ownerToken,
        status: 'succeeded',
        history: {
          routineId: FIXTURE_F.routineId,
          identityId: FIXTURE_F.identityId,
          occurrenceKey: fixtureOccurrenceKey(),
          scheduledFor: FIXTURE_F.firstOccurrenceAt,
          triggeredAt: deps.nowMs(),
          result: 'success',
          reason: null,
        },
        nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
      }),
    ).rejects.toBeInstanceOf(LeaseFencingException);

    // The live owner completes successfully.
    const receipt = await deps.store.completeOccurrence({
      occurrenceId: leaseB.occurrenceId,
      fencingToken: leaseB.fencingToken,
      ownerToken: leaseB.ownerToken,
      status: 'succeeded',
      history: {
        routineId: FIXTURE_F.routineId,
        identityId: FIXTURE_F.identityId,
        occurrenceKey: fixtureOccurrenceKey(),
        scheduledFor: FIXTURE_F.firstOccurrenceAt,
        triggeredAt: deps.nowMs(),
        result: 'success',
        reason: null,
      },
      nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
    });
    expect(receipt.status).toBe('succeeded');
  });

  it('dead-letters a concurrent double-dispatch via fencing and never double-notifies', async () => {
    const deps = createDeployment();
    const input = createExecutionInput();

    const [a, b] = await Promise.all([
      deps.source.executeRoutineOccurrence(input),
      deps.source.executeRoutineOccurrence(input),
    ]);

    const kinds = [a.kind, b.kind].sort();
    if (a.kind === 'dead-letter') {
      expect(a.reason).toBe('fencing-rejected');
    }
    if (b.kind === 'dead-letter') {
      expect(b.reason).toBe('fencing-rejected');
    }
    expect(kinds.filter((kind) => kind === 'succeeded').length).toBeGreaterThanOrEqual(1);
    expect(deps.writer.rows).toHaveLength(1);
    expect(deps.published).toHaveLength(1);
  });

  it('skips cleanly when the routine snapshot is unavailable', async () => {
    const deps = createDeployment({ snapshot: null });
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());
    expect(outcome).toEqual({ kind: 'skipped', reason: 'routine-unavailable', occurrenceId: null });
    expect(deps.published).toHaveLength(0);
  });

  it('skips a stale durable invocation when the global Routine gate is now closed', async () => {
    const deps = createDeployment({ globalEnabled: false });
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());

    expect(outcome).toEqual({ kind: 'skipped', reason: 'routine-unavailable', occurrenceId: null });
    expect(deps.writer.rows).toHaveLength(0);
  });

  it('skips a stale durable invocation when Profile/Membership gates are now closed', async () => {
    const deps = createDeployment({ durableProfileGateOpen: false });
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());

    expect(outcome).toEqual({ kind: 'skipped', reason: 'routine-unavailable', occurrenceId: null });
  });

  it('skips cleanly on revision drift', async () => {
    const deps = createDeployment({
      snapshot: buildFixtureFRoutine({ version: FIXTURE_F.version + 1 }),
    });
    const outcome = await deps.source.executeRoutineOccurrence(
      createExecutionInput({ sourceRevision: FIXTURE_F.version }),
    );
    expect(outcome).toEqual({ kind: 'skipped', reason: 'revision-drifted', occurrenceId: null });
    expect(deps.writer.rows).toHaveLength(0);
  });

  it('skips cleanly when the occurrence is no longer eligible (active snooze)', async () => {
    const snooze = createSnoozeOverride({
      now: FIXTURE_F.firstOccurrenceAt - 60_000,
      durationMs: 2 * 60 * 60_000,
      reason: 'fixture snooze',
    });
    const deps = createDeployment({
      temporaryOverride: snooze,
      now: FIXTURE_F.firstOccurrenceAt + 1,
    });
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());
    expect(outcome).toEqual({
      kind: 'skipped',
      reason: 'no-eligible-occurrence',
      occurrenceId: null,
    });
    expect(deps.writer.rows).toHaveLength(0);
  });

  it('returns retryable when the notification writer is temporarily unavailable', async () => {
    const deps = createDeployment({
      writer: {
        async enqueueRoutineOccurrenceRequested() {
          throw new Error('outbox closed');
        },
      },
    });
    const outcome = await deps.source.executeRoutineOccurrence(createExecutionInput());
    expect(outcome.kind).toBe('retryable');
    if (outcome.kind === 'retryable') {
      expect(outcome.error).toBe('outbox closed');
    }
    expect(deps.published).toHaveLength(0);
  });
});
