import { describe, expect, it, vi } from 'vitest';
import { asInstant, createTimeContext } from '@memoflow/time';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import type { NotificationRequestedWriterPort } from '@memoflow/notification';
import { createActiveUsageTrigger, createElapsedTrigger } from '@memoflow/reminder/server';
import type {
  IdleSensorPort,
  ProtocolBreakCompletionFact,
  UserIdleObserved,
  UserResumeObserved,
} from '@memoflow/reminder/routine-runtime';
import { composeRoutine } from './compose-routine';

class RoutineDb implements IElectronDatabase {
  private readonly occurrences = new Map<string, Record<string, unknown>>();
  private readonly interactions = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly triggerJson: string,
    private readonly definitionUpdatedAt = new Date().toISOString(),
  ) {}

  private occurrenceKey(identityId: unknown, routineId: unknown, occurrenceKey: unknown): string {
    return `${String(identityId)}\u0000${String(routineId)}\u0000${String(occurrenceKey)}`;
  }

  async getAll<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM routine_definitions')) {
      return [
        {
          id: 'routine-opaque',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: this.triggerJson,
          version: 1,
          updated_at: this.definitionUpdatedAt,
        },
      ] as T[];
    }
    if (sql.includes('FROM routine_profile_memberships')) {
      return [
        {
          routine_id: 'routine-opaque',
          profile_id: 'profile-1',
          membership_enabled: 1,
          profile_enabled: 1,
        },
      ] as T[];
    }
    if (sql.includes('FROM routine_temporary_overrides')) return [] as T[];
    if (sql.includes('FROM routine_occurrences')) {
      return [...this.occurrences.values()]
        .filter(
          (row) =>
            row.identity_id === 'identity-1' &&
            (row.trigger_kind === 'Elapsed' || row.trigger_kind === 'ActiveUsage'),
        )
        .sort((a, b) => String(b.became_due_at).localeCompare(String(a.became_due_at)))
        .map((row) => ({
          routine_id: row.routine_id,
          occurrence_key: row.occurrence_key,
          trigger_kind: row.trigger_kind,
          source_revision: row.source_revision,
          resolution_state: row.resolution_state,
          resolved_at: row.resolved_at,
          became_due_at: row.became_due_at,
        })) as T[];
    }
    if (sql.includes('FROM routine_interactions')) {
      return [...this.interactions.values()] as T[];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  async getOptional<T>(sql: string, parameters: unknown[] = []): Promise<T | null> {
    if (sql.includes('FROM routine_profiles')) {
      return {
        id: 'profile-1',
        identity_id: 'identity-1',
        name: 'Work',
        description: null,
        enabled: 1,
        version: 1,
        created_at: 1,
        updated_at: 1,
      } as T;
    }
    if (sql.includes('FROM routine_interactions')) {
      if (sql.includes('idempotency_key = ?')) {
        return (
          ([...this.interactions.values()].find(
            (row) => row.idempotency_key === parameters[0],
          ) as T | undefined) ?? null
        );
      }
      if (sql.includes('id = ?')) {
        return (this.interactions.get(String(parameters[0])) as T | undefined) ?? null;
      }
    }
    if (sql.includes('FROM routine_occurrences')) {
      return (
        (this.occurrences.get(this.occurrenceKey(parameters[0], parameters[1], parameters[2])) as T | undefined) ??
        null
      );
    }
    return null;
  }

  async get<T>(sql: string, parameters: unknown[] = []): Promise<T> {
    const row = await this.getOptional<T>(sql, parameters);
    if (row == null) throw new Error('row not found');
    return row;
  }

  async execute(sql: string, parameters: unknown[] = []): Promise<IElectronDatabaseQueryResult> {
    if (sql.includes('INSERT INTO routine_occurrences')) {
      const [
        id, identityId, routineId, , occurrenceKey, scheduledFor, sourceRevision, , status,
        triggerKind, becameDueAt, resolutionState, resolvedAt, resolutionKind, resolutionReason,
        attempt, ownerToken, claimId, fencingToken, leaseExpiresAt, lastError, nextRetryAt,
        deadLetterAt, correlationId, causationId, historyJson, nextOccurrenceAt, createdAt,
        updatedAt, finishedAt,
      ] = parameters;
      this.occurrences.set(this.occurrenceKey(identityId, routineId, occurrenceKey), {
        id,
        identity_id: identityId,
        routine_id: routineId,
        occurrence_key: occurrenceKey,
        scheduled_for: scheduledFor,
        source_revision: sourceRevision,
        status,
        trigger_kind: triggerKind,
        became_due_at: becameDueAt,
        resolution_state: resolutionState,
        resolved_at: resolvedAt,
        resolution_kind: resolutionKind,
        resolution_reason: resolutionReason,
        attempt,
        owner_token: ownerToken,
        claim_id: claimId,
        fencing_token: fencingToken,
        lease_expires_at: leaseExpiresAt,
        last_error: lastError,
        next_retry_at: nextRetryAt,
        dead_letter_at: deadLetterAt,
        correlation_id: correlationId,
        causation_id: causationId,
        history_json: historyJson,
        next_occurrence_at: nextOccurrenceAt,
        created_at: createdAt,
        updated_at: updatedAt,
        finished_at: finishedAt,
      });
      return { rowsAffected: 1 };
    }
    if (sql.includes('INSERT INTO routine_interactions')) {
      const [
        id,
        idempotencyKey,
        identityId,
        routineId,
        occurrenceKey,
        action,
        actedAt,
        responseLatencyMs,
        snoozeDurationMs,
        metadataJson,
      ] = parameters;
      this.interactions.set(String(id), {
        id,
        idempotency_key: idempotencyKey,
        identity_id: identityId,
        routine_id: routineId,
        occurrence_key: occurrenceKey,
        action,
        acted_at: actedAt,
        response_latency_ms: responseLatencyMs,
        snooze_duration_ms: snoozeDurationMs,
        metadata_json: metadataJson,
      });
      return { rowsAffected: 1 };
    }
    if (sql.includes('UPDATE routine_occurrences')) {
      const [state, resolvedAt, resolutionKind, resolutionReason, updatedAt, id, identityId, routineId] =
        parameters;
      const entry = [...this.occurrences.entries()].find(
        ([, row]) =>
          row.id === id && row.identity_id === identityId && row.routine_id === routineId &&
          row.resolution_state === 'Open',
      );
      if (!entry) return { rowsAffected: 0 };
      entry[1].resolution_state = state;
      entry[1].resolved_at = resolvedAt;
      entry[1].resolution_kind = resolutionKind;
      entry[1].resolution_reason = resolutionReason;
      entry[1].updated_at = updatedAt;
      return { rowsAffected: 1 };
    }
    return { rowsAffected: 0 };
  }


  seedOccurrence(input: {
    occurrenceKey: string;
    triggerKind: 'Elapsed' | 'ActiveUsage';
    sourceRevision: string;
    becameDueAt: number;
    resolutionState: 'Open' | 'Satisfied' | 'Skipped' | 'Expired';
    resolvedAt?: number | null;
  }): void {
    const key = this.occurrenceKey('identity-1', 'routine-opaque', input.occurrenceKey);
    this.occurrences.set(key, {
      id: `seed:${input.occurrenceKey}`,
      identity_id: 'identity-1',
      routine_id: 'routine-opaque',
      occurrence_key: input.occurrenceKey,
      scheduled_for: null,
      source_revision: input.sourceRevision,
      trigger_kind: input.triggerKind,
      became_due_at: new Date(input.becameDueAt).toISOString(),
      resolution_state: input.resolutionState,
      resolved_at:
        input.resolvedAt == null ? null : new Date(input.resolvedAt).toISOString(),
      resolution_kind:
        input.resolutionState === 'Satisfied' ? 'ExplicitComplete' : null,
      resolution_reason: null,
    });
  }

  occurrence(occurrenceKey: string): Record<string, unknown> | null {
    return this.occurrences.get(this.occurrenceKey('identity-1', 'routine-opaque', occurrenceKey)) ?? null;
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }
}

class ControlledIdleSensor implements IdleSensorPort {
  private idleListener: ((event: UserIdleObserved) => void) | null = null;
  private resumeListener: ((event: UserResumeObserved) => void) | null = null;

  getIdleDurationMs(): number {
    return 0;
  }

  onIdle(listener: (event: UserIdleObserved) => void): () => void {
    this.idleListener = listener;
    return () => {
      if (this.idleListener === listener) this.idleListener = null;
    };
  }

  onResume(listener: (event: UserResumeObserved) => void): () => void {
    this.resumeListener = listener;
    return () => {
      if (this.resumeListener === listener) this.resumeListener = null;
    };
  }

  emitIdle(event: UserIdleObserved): void {
    this.idleListener?.(event);
  }
}

const notificationWriter = {
  enqueueNotificationRequested: vi.fn(),
} as unknown as NotificationRequestedWriterPort;
const userTimeContextPort = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};

const trigger = createActiveUsageTrigger({
  requiredActiveMs: 1_000,
  naturalBreakCredit: { idleDurationMs: 500 },
  protocolBreakCredit: { kind: 'Stand', minimumBreakMs: 500 },
});

function createComposition(
  idleSensor = new ControlledIdleSensor(),
  routineTrigger = trigger,
  definitionUpdatedAt = new Date().toISOString(),
) {
  const db = new RoutineDb(JSON.stringify(routineTrigger), definitionUpdatedAt);
  return {
    db,
    idleSensor,
    composed: composeRoutine({
      db,
      identityId: 'identity-1',
      notificationRequestedWriter: notificationWriter,
      userTimeContextPort,
      idleSensor,
      interventionPolicy: {
        gentleDurationMs: 100,
        graceDurationMs: 100,
        guidedDurationMs: 100,
        strictEnabled: false,
      },
    }),
  };
}

describe('composeRoutine local Routine vertical slice', () => {
  it('projects durable ActiveUsage state and turns threshold due into InterventionRuntime truth', async () => {
    const { composed } = createComposition();
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    const t0 = Date.now();

    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));
    await composed.flushRoutineOccurrencePersistence();

    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 1_000,
      generation: 1,
      thresholdSignaled: true,
    });
    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      state: 'Due',
      policy: { strictEnabled: false },
    });
  });

  it('refreshes local ActiveUsage gates after profile deactivation', async () => {
    const { composed } = createComposition();
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).not.toBeNull();

    const t0 = Date.now();
    composed.activeUsageRuntime.advance(asInstant(t0));
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: false,
    });
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 0,
      thresholdSignaled: false,
    });
    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toBeNull();
  });

  it('closes the exact due intervention when an explicit compatible protocol break satisfies the lane', async () => {
    const { composed } = createComposition();
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    const t0 = Date.now();
    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-1:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-1',
      protocolId: 'protocol-1',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: asInstant(t0 + 1_000),
      completedAt: asInstant(t0 + 1_500),
      breakDurationMs: 500,
      capabilities: ['stand'],
    };

    expect(composed.protocolBreakCreditRuntime.creditBreak(fact).credited).toHaveLength(1);
    await composed.flushRoutineOccurrencePersistence();
    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({ state: 'Completed', completionReason: 'natural-stop' });
    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 0,
      generation: 2,
      thresholdSignaled: false,
    });
  });

  it('closes an already-due intervention when a natural idle break satisfies the lane', async () => {
    const { composed, idleSensor } = createComposition();
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    const t0 = Date.now();
    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    composed.activityRuntime.start();
    composed.activeUsageRuntime.start();
    const idleAt = asInstant(t0 + 1_600);
    idleSensor.emitIdle({ at: idleAt, idleDurationMs: 600 });
    await composed.flushRoutineOccurrencePersistence();

    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({ state: 'Completed', completionReason: 'natural-stop' });
    expect(
      composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')?.generation,
    ).toBe(2);

    composed.activeUsageRuntime.stop();
    composed.activityRuntime.stop();
  });

  it('replays an open ActiveUsage occurrence after restart with its original business due time', async () => {
    const dueAt = Date.parse('2026-09-17T03:00:00.000Z');
    const { composed, db } = createComposition();
    const occurrenceKey = 'routine:routine-opaque:active-usage:3';
    db.seedOccurrence({
      occurrenceKey,
      triggerKind: 'ActiveUsage',
      sourceRevision: '3',
      becameDueAt: dueAt,
      resolutionState: 'Open',
    });

    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 1_000,
      generation: 3,
      thresholdSignaled: false,
    });

    // The first advance establishes the local clock; the next tick replays the
    // already-due generation instead of allocating generation 1 again.
    composed.activeUsageRuntime.advance(asInstant(dueAt + 10_000));
    composed.activeUsageRuntime.advance(asInstant(dueAt + 10_001));
    await composed.flushRoutineOccurrencePersistence();

    expect(composed.interventionRuntime.getSnapshot(occurrenceKey)).toMatchObject({
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      dueAt,
      state: 'Due',
    });
    expect(db.occurrence(occurrenceKey)).toMatchObject({
      trigger_kind: 'ActiveUsage',
      became_due_at: new Date(dueAt).toISOString(),
      resolution_state: 'Open',
    });
    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      generation: 3,
      thresholdSignaled: true,
    });
  });

  it('projects Elapsed definition revision into one durable open occurrence before presentation', async () => {
    const t0 = Date.parse('2026-09-17T04:00:00.000Z');
    const elapsedTrigger = createElapsedTrigger({
      durationMs: 1_000,
      anchor: 'routine-activation',
    });
    const { composed, db } = createComposition(
      new ControlledIdleSensor(),
      elapsedTrigger,
      new Date(t0).toISOString(),
    );

    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    composed.elapsedRuntime.advance(asInstant(t0 + 999));
    expect(composed.interventionRuntime.listActive()).toEqual([]);

    composed.elapsedRuntime.advance(asInstant(t0 + 1_000));
    await composed.flushRoutineOccurrencePersistence();

    const occurrenceKey = 'routine:routine-opaque:elapsed:definition-1:1';
    expect(composed.elapsedRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      anchorAt: t0,
      anchorRevision: 'definition-1',
      generation: 1,
      thresholdSignaled: true,
    });
    expect(composed.interventionRuntime.getSnapshot(occurrenceKey)).toMatchObject({
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      state: 'Due',
      dueAt: t0 + 1_000,
    });
    expect(db.occurrence(occurrenceKey)).toMatchObject({
      trigger_kind: 'Elapsed',
      scheduled_for: null,
      source_revision: 'definition-1',
      resolution_state: 'Open',
    });
  });

  it('restarts Elapsed from the satisfied occurrence without writing runtime anchor into the definition', async () => {
    const t0 = Date.parse('2026-09-17T05:00:00.000Z');
    const elapsedTrigger = createElapsedTrigger({ durationMs: 1_000, anchor: 'last-satisfied' });
    const { composed, db } = createComposition(
      new ControlledIdleSensor(),
      elapsedTrigger,
      new Date(t0).toISOString(),
    );
    await composed.routineCommandPort.setProfileActive({
      identityId: 'identity-1',
      profileId: 'profile-1',
      active: true,
    });
    composed.elapsedRuntime.advance(asInstant(t0 + 1_000));
    await composed.flushRoutineOccurrencePersistence();

    const firstKey = 'routine:routine-opaque:elapsed:definition-1:1';
    const satisfiedAt = t0 + 1_100;
    await composed.routineCommandPort.respondToOccurrence({
      commandId: `${firstKey}:v1:complete`,
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      occurrenceKey: firstKey,
      action: 'complete',
      at: satisfiedAt,
    });
    composed.elapsedRuntime.markSatisfied({
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      at: satisfiedAt,
    });

    await composed.refreshLocalRoutineRegistrations();
    expect(composed.elapsedRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      anchorAt: satisfiedAt,
      anchorRevision: `satisfied-${satisfiedAt}`,
      generation: 1,
      thresholdSignaled: false,
    });

    composed.elapsedRuntime.advance(asInstant(satisfiedAt + 1_000));
    await composed.flushRoutineOccurrencePersistence();
    const nextKey = `routine:routine-opaque:elapsed:satisfied-${satisfiedAt}:1`;
    expect(db.occurrence(nextKey)).toMatchObject({
      trigger_kind: 'Elapsed',
      scheduled_for: null,
      resolution_state: 'Open',
    });
  });

});
