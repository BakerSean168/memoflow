import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { asInstant } from '@memoflow/time';
import { createSnoozeOverride } from '../../domain/routine';
import { PowerSyncRoutineOccurrenceTruthStore } from './routine-occurrence-truth-store.powersync';

function createDb(): IElectronDatabase & { close(): void; exec(sql: string): void } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE routine_occurrences (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      source TEXT NOT NULL,
      occurrence_key TEXT NOT NULL,
      scheduled_for TEXT,
      source_revision TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      became_due_at TEXT NOT NULL,
      resolution_state TEXT NOT NULL,
      resolved_at TEXT,
      resolution_kind TEXT,
      resolution_reason TEXT,
      attempt INTEGER NOT NULL,
      owner_token TEXT,
      claim_id TEXT,
      fencing_token INTEGER NOT NULL,
      lease_expires_at TEXT,
      last_error TEXT,
      next_retry_at TEXT,
      dead_letter_at TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      history_json TEXT,
      next_occurrence_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      UNIQUE(identity_id, routine_id, occurrence_key)
    );
    CREATE TABLE routine_temporary_overrides (
      identity_id TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      override_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(identity_id, routine_id)
    );
    CREATE TABLE routine_interactions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      identity_id TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      occurrence_key TEXT NOT NULL,
      action TEXT NOT NULL,
      acted_at TEXT NOT NULL,
      response_latency_ms INTEGER,
      snooze_duration_ms INTEGER,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters: unknown[] = []): Promise<IElectronDatabaseQueryResult> {
      const info = sqlite.prepare(sql).run(...parameters);
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...parameters) as T[];
    },
    async getOptional<T>(sql: string, parameters: unknown[] = []): Promise<T | null> {
      return (sqlite.prepare(sql).get(...parameters) as T | undefined) ?? null;
    },
    async get<T>(sql: string, parameters: unknown[] = []): Promise<T> {
      const row = sqlite.prepare(sql).get(...parameters) as T | undefined;
      if (!row) throw new Error('row not found');
      return row;
    },
    async writeTransaction<T>(callback: (tx: IElectronDatabaseTransaction) => Promise<T>) {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return Object.assign(wrapper, { close: () => sqlite.close(), exec: (sql: string) => sqlite.exec(sql) });
}

describe('PowerSyncRoutineOccurrenceTruthStore', () => {
  it('round-trips one durable occurrence and applies Completed interaction exactly once', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncRoutineOccurrenceTruthStore(db);
      const dueAt = asInstant(Date.parse('2026-09-17T08:00:00.000Z'));
      const first = await store.ensureOpenOccurrence({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: 'routine:routine-1:active-usage:3',
        triggerKind: 'ActiveUsage',
        becameDueAt: dueAt,
        sourceRevision: 7,
      });
      const replayedDue = await store.ensureOpenOccurrence({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: first.occurrenceKey,
        triggerKind: 'ActiveUsage',
        becameDueAt: dueAt,
        sourceRevision: 7,
      });

      expect(replayedDue.id).toBe(first.id);
      expect(replayedDue).toMatchObject({
        triggerKind: 'ActiveUsage',
        resolutionState: 'Open',
        sourceRevision: '7',
      });

      const completed = await store.applyInteraction({
        idempotencyKey: `${first.occurrenceKey}:v1:complete`,
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: first.occurrenceKey,
        action: 'Completed',
        actedAt: asInstant(Number(dueAt) + 15_000),
        responseLatencyMs: 15_000,
        metadata: { surface: 'InterventionWindow' },
      });
      const replay = await store.applyInteraction({
        idempotencyKey: `${first.occurrenceKey}:v1:complete`,
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: first.occurrenceKey,
        action: 'Completed',
        actedAt: asInstant(Number(dueAt) + 15_000),
        responseLatencyMs: 15_000,
        metadata: { surface: 'InterventionWindow' },
      });

      expect(completed.replayed).toBe(false);
      expect(completed.occurrence).toMatchObject({
        resolutionState: 'Satisfied',
        resolutionKind: 'ExplicitComplete',
      });
      expect(replay.replayed).toBe(true);
      expect(replay.interaction.id).toBe(completed.interaction.id);
      expect(await store.listInteractions({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: first.occurrenceKey,
      })).toHaveLength(1);

      // New adapter instance proves this is durable truth, not runtime memory.
      const afterRestart = new PowerSyncRoutineOccurrenceTruthStore(db);
      await expect(afterRestart.findOccurrence({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: first.occurrenceKey,
      })).resolves.toMatchObject({ resolutionState: 'Satisfied' });
    } finally {
      db.close();
    }
  });

  it('keeps Snoozed as an interaction while occurrence remains Open', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncRoutineOccurrenceTruthStore(db);
      const dueAt = asInstant(1_000);
      const occurrence = await store.ensureOpenOccurrence({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: 'routine:routine-1:elapsed:rev-2',
        triggerKind: 'Elapsed',
        becameDueAt: dueAt,
      });
      const firstOverride = createSnoozeOverride({
        now: 2_000,
        durationMs: 300_000,
        reason: 'user snooze',
      });
      const commandId = `${occurrence.occurrenceKey}:v1:snooze:300000`;
      const snoozed = await store.applyInteraction({
        idempotencyKey: commandId,
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: occurrence.occurrenceKey,
        action: 'Snoozed',
        actedAt: asInstant(2_000),
        snoozeDurationMs: 300_000,
        temporaryOverride: firstOverride,
      });
      const replayed = await store.applyInteraction({
        idempotencyKey: commandId,
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: occurrence.occurrenceKey,
        action: 'Snoozed',
        actedAt: asInstant(7_000),
        snoozeDurationMs: 300_000,
        temporaryOverride: createSnoozeOverride({
          now: 7_000,
          durationMs: 300_000,
          reason: 'retry must not extend snooze',
        }),
      });
      const persistedOverride = await db.get<{ override_json: string; version: number }>(
        `SELECT override_json, version FROM routine_temporary_overrides
          WHERE identity_id = ? AND routine_id = ?`,
        ['identity-1', 'routine-1'],
      );

      expect(snoozed.occurrence.resolutionState).toBe('Open');
      expect(snoozed.interaction.snoozeDurationMs).toBe(300_000);
      expect(replayed.replayed).toBe(true);
      expect(replayed.interaction.id).toBe(snoozed.interaction.id);
      expect(JSON.parse(persistedOverride.override_json)).toMatchObject({ snoozeUntil: 302_000 });
      expect(persistedOverride.version).toBe(1);
      expect(await store.listInteractions({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: occurrence.occurrenceKey,
      })).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('rolls back the snooze override when the interaction insert fails', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncRoutineOccurrenceTruthStore(db);
      const occurrence = await store.ensureOpenOccurrence({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: 'routine:routine-1:active-usage:rollback',
        triggerKind: 'ActiveUsage',
        becameDueAt: asInstant(1_000),
      });
      db.exec(`
        CREATE TRIGGER force_routine_interaction_failure
        BEFORE INSERT ON routine_interactions
        BEGIN
          SELECT RAISE(ABORT, 'forced interaction failure');
        END;
      `);

      await expect(store.applyInteraction({
        idempotencyKey: `${occurrence.occurrenceKey}:v1:snooze:300000`,
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: occurrence.occurrenceKey,
        action: 'Snoozed',
        actedAt: asInstant(2_000),
        snoozeDurationMs: 300_000,
        temporaryOverride: createSnoozeOverride({
          now: 2_000,
          durationMs: 300_000,
          reason: 'atomic rollback',
        }),
      })).rejects.toThrow(/forced interaction failure/);

      expect(await db.getOptional(
        `SELECT override_json FROM routine_temporary_overrides
          WHERE identity_id = ? AND routine_id = ?`,
        ['identity-1', 'routine-1'],
      )).toBeNull();
      expect(await store.listInteractions({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: occurrence.occurrenceKey,
      })).toEqual([]);
    } finally {
      db.close();
    }
  });
});
