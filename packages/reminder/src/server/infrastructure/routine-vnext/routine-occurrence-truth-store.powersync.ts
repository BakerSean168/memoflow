import { randomUUID } from 'node:crypto';
import type {
  IElectronDatabase,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { asInstant } from '@memoflow/time';
import type {
  ApplyRoutineInteractionInput,
  EnsureRoutineOccurrenceInput,
  ResolveRoutineOccurrenceInput,
  RoutineInteractionApplyReceipt,
  RoutineInteractionFact,
  RoutineOccurrenceFact,
  RoutineOccurrenceTruthStore,
} from '../../domain/ports';
import {
  ROUTINE_INTERACTION_ACTIONS,
  ROUTINE_OCCURRENCE_RESOLUTION_KINDS,
  ROUTINE_OCCURRENCE_RESOLUTION_STATES,
  ROUTINE_OCCURRENCE_TRIGGER_KINDS,
} from '../../domain/ports';
import { serializeRoutineTemporaryOverride } from './trigger-persistence-parity';

const ROUTINE_OCCURRENCE_SOURCE = 'routine';

type Db = IElectronDatabaseTransaction;

interface RoutineOccurrenceRow {
  id: string;
  identity_id: string;
  routine_id: string;
  occurrence_key: string;
  scheduled_for: string | null;
  source_revision: string | null;
  trigger_kind: string;
  became_due_at: string;
  resolution_state: string;
  resolved_at: string | null;
  resolution_kind: string | null;
  resolution_reason: string | null;
}

interface RoutineInteractionRow {
  id: string;
  idempotency_key: string;
  identity_id: string;
  routine_id: string;
  occurrence_key: string;
  action: string;
  acted_at: string;
  response_latency_ms: number | null;
  snooze_duration_ms: number | null;
  metadata_json: string | null;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must not be empty`);
  return normalized;
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw new TypeError(`Invalid ${field}: ${value}`);
  return value as T;
}

function parseInstant(value: string, field: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`Invalid ${field}: ${value}`);
  return asInstant(parsed);
}

function mapOccurrence(row: RoutineOccurrenceRow): RoutineOccurrenceFact {
  return {
    id: row.id,
    identityId: row.identity_id,
    routineId: row.routine_id,
    occurrenceKey: row.occurrence_key,
    triggerKind: assertEnum(row.trigger_kind, ROUTINE_OCCURRENCE_TRIGGER_KINDS, 'triggerKind'),
    scheduledFor: row.scheduled_for == null ? null : parseInstant(row.scheduled_for, 'scheduledFor'),
    becameDueAt: parseInstant(row.became_due_at, 'becameDueAt'),
    sourceRevision: row.source_revision,
    resolutionState: assertEnum(
      row.resolution_state,
      ROUTINE_OCCURRENCE_RESOLUTION_STATES,
      'resolutionState',
    ),
    resolvedAt: row.resolved_at == null ? null : parseInstant(row.resolved_at, 'resolvedAt'),
    resolutionKind:
      row.resolution_kind == null
        ? null
        : assertEnum(row.resolution_kind, ROUTINE_OCCURRENCE_RESOLUTION_KINDS, 'resolutionKind'),
    resolutionReason: row.resolution_reason,
  };
}

function mapInteraction(row: RoutineInteractionRow): RoutineInteractionFact {
  let metadata: Readonly<Record<string, unknown>> | null = null;
  if (row.metadata_json != null) {
    const parsed: unknown = JSON.parse(row.metadata_json);
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
      throw new TypeError('Routine interaction metadata must be an object');
    }
    metadata = parsed as Readonly<Record<string, unknown>>;
  }
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    identityId: row.identity_id,
    routineId: row.routine_id,
    occurrenceKey: row.occurrence_key,
    action: assertEnum(row.action, ROUTINE_INTERACTION_ACTIONS, 'interaction action'),
    actedAt: parseInstant(row.acted_at, 'actedAt'),
    responseLatencyMs: row.response_latency_ms,
    snoozeDurationMs: row.snooze_duration_ms,
    metadata,
  };
}

function assertInteractionReplayMatches(
  row: RoutineInteractionRow,
  input: ApplyRoutineInteractionInput,
  snoozeDurationMs: number | null,
): void {
  if (
    row.identity_id !== input.identityId ||
    row.routine_id !== input.routineId ||
    row.occurrence_key !== input.occurrenceKey ||
    row.action !== input.action ||
    row.snooze_duration_ms !== snoozeDurationMs
  ) {
    throw new Error(`Routine interaction idempotency key '${input.idempotencyKey}' was reused for a different command`);
  }
}

async function findOccurrenceRow(
  db: Db,
  input: { identityId: string; routineId: string; occurrenceKey: string },
): Promise<RoutineOccurrenceRow | null> {
  return db.getOptional<RoutineOccurrenceRow>(
    `SELECT id, identity_id, routine_id, occurrence_key, scheduled_for, source_revision,
            trigger_kind, became_due_at, resolution_state, resolved_at,
            resolution_kind, resolution_reason
       FROM routine_occurrences
      WHERE identity_id = ? AND routine_id = ? AND occurrence_key = ?
      LIMIT 1`,
    [input.identityId, input.routineId, input.occurrenceKey],
  );
}

async function requireOccurrenceRow(
  db: Db,
  input: { identityId: string; routineId: string; occurrenceKey: string },
): Promise<RoutineOccurrenceRow> {
  const row = await findOccurrenceRow(db, input);
  if (!row) throw new Error(`Routine occurrence '${input.occurrenceKey}' was not found for owner '${input.routineId}'`);
  return row;
}

async function resolveOnDb(db: Db, input: ResolveRoutineOccurrenceInput): Promise<RoutineOccurrenceRow> {
  const current = await requireOccurrenceRow(db, input);
  const state = assertEnum(current.resolution_state, ROUTINE_OCCURRENCE_RESOLUTION_STATES, 'resolutionState');
  if (state !== 'Open') {
    if (state === input.state && current.resolution_kind === input.resolutionKind) return current;
    throw new Error(`Routine occurrence '${input.occurrenceKey}' is already resolved as ${state}`);
  }
  const result = await db.execute(
    `UPDATE routine_occurrences
        SET resolution_state = ?, resolved_at = ?, resolution_kind = ?, resolution_reason = ?, updated_at = ?
      WHERE id = ? AND identity_id = ? AND routine_id = ? AND resolution_state = 'Open'`,
    [
      input.state,
      new Date(Number(input.resolvedAt)).toISOString(),
      input.resolutionKind,
      input.reason?.trim() || null,
      new Date(Number(input.resolvedAt)).toISOString(),
      current.id,
      input.identityId,
      input.routineId,
    ],
  );
  if (result.rowsAffected !== 1) {
    const raced = await requireOccurrenceRow(db, input);
    if (raced.resolution_state === input.state && raced.resolution_kind === input.resolutionKind) return raced;
    throw new Error(`Routine occurrence '${input.occurrenceKey}' resolution conflict`);
  }
  return requireOccurrenceRow(db, input);
}

function resolutionForInteraction(input: ApplyRoutineInteractionInput): Omit<ResolveRoutineOccurrenceInput, 'identityId' | 'routineId' | 'occurrenceKey'> | null {
  if (input.action === 'Completed') {
    return { state: 'Satisfied', resolutionKind: 'ExplicitComplete', resolvedAt: input.actedAt, reason: null };
  }
  if (input.action === 'Skipped') {
    return { state: 'Skipped', resolutionKind: 'UserSkipped', resolvedAt: input.actedAt, reason: null };
  }
  return null;
}

function normalizeOptionalNumber(value: number | null | undefined, field: string, positiveOnly: boolean): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || (positiveOnly ? value <= 0 : value < 0)) {
    throw new TypeError(`${field} must be ${positiveOnly ? 'positive' : 'non-negative'}`);
  }
  return value;
}

/** PowerSync/local counterpart of PrismaRoutineOccurrenceTruthStore. */
export class PowerSyncRoutineOccurrenceTruthStore implements RoutineOccurrenceTruthStore {
  constructor(private readonly db: IElectronDatabase) {}

  async ensureOpenOccurrence(input: EnsureRoutineOccurrenceInput): Promise<RoutineOccurrenceFact> {
    return this.db.writeTransaction(async (tx) => {
      const identityId = nonEmpty(input.identityId, 'identityId');
      const routineId = nonEmpty(input.routineId, 'routineId');
      const occurrenceKey = nonEmpty(input.occurrenceKey, 'occurrenceKey');
      const existing = await findOccurrenceRow(tx, { identityId, routineId, occurrenceKey });
      if (existing) {
        const fact = mapOccurrence(existing);
        if (fact.triggerKind !== input.triggerKind) {
          throw new Error(
            `Routine occurrence '${occurrenceKey}' trigger mismatch: ${fact.triggerKind} != ${input.triggerKind}`,
          );
        }
        return fact;
      }

      const dueAt = new Date(Number(input.becameDueAt));
      const scheduledFor =
        input.scheduledFor == null ? null : new Date(Number(input.scheduledFor));
      if (
        !Number.isFinite(dueAt.getTime()) ||
        (scheduledFor != null && !Number.isFinite(scheduledFor.getTime()))
      ) {
        throw new TypeError('Routine occurrence instants must be valid');
      }
      const id = `RoutineOccurrence_${randomUUID()}`;
      const timestamp = dueAt.toISOString();
      const result = await tx.execute(
        `INSERT INTO routine_occurrences (
           id, identity_id, routine_id, source, occurrence_key, scheduled_for,
           source_revision, idempotency_key, status, trigger_kind, became_due_at,
           resolution_state, resolved_at, resolution_kind, resolution_reason,
           attempt, owner_token, claim_id, fencing_token, lease_expires_at,
           last_error, next_retry_at, dead_letter_at, correlation_id, causation_id,
           history_json, next_occurrence_at, created_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          identityId,
          routineId,
          ROUTINE_OCCURRENCE_SOURCE,
          occurrenceKey,
          scheduledFor?.toISOString() ?? null,
          input.sourceRevision == null ? null : String(input.sourceRevision),
          buildIdempotencyKeyString({ identityId, source: ROUTINE_OCCURRENCE_SOURCE, occurrenceKey }),
          'succeeded',
          input.triggerKind,
          timestamp,
          'Open',
          null,
          null,
          null,
          1,
          null,
          null,
          0,
          null,
          null,
          null,
          null,
          null,
          null,
          '[]',
          null,
          timestamp,
          timestamp,
          timestamp,
        ],
      );
      if (result.rowsAffected !== 1) throw new Error(`Routine occurrence '${occurrenceKey}' insert failed`);
      return mapOccurrence(await requireOccurrenceRow(tx, { identityId, routineId, occurrenceKey }));
    });
  }

  async findOccurrence(input: { readonly identityId: string; readonly routineId: string; readonly occurrenceKey: string }): Promise<RoutineOccurrenceFact | null> {
    const row = await findOccurrenceRow(this.db, input);
    return row ? mapOccurrence(row) : null;
  }

  async resolveOccurrence(input: ResolveRoutineOccurrenceInput): Promise<RoutineOccurrenceFact> {
    return this.db.writeTransaction(async (tx) => mapOccurrence(await resolveOnDb(tx, input)));
  }

  async applyInteraction(input: ApplyRoutineInteractionInput): Promise<RoutineInteractionApplyReceipt> {
    const idempotencyKey = nonEmpty(input.idempotencyKey, 'idempotencyKey');
    const responseLatencyMs = normalizeOptionalNumber(input.responseLatencyMs, 'responseLatencyMs', false);
    const snoozeDurationMs = normalizeOptionalNumber(input.snoozeDurationMs, 'snoozeDurationMs', true);
    const temporaryOverride = input.temporaryOverride ?? null;
    if (input.action === 'Snoozed' && snoozeDurationMs == null) throw new TypeError('Snoozed interaction requires snoozeDurationMs');
    if (input.action === 'Snoozed' && temporaryOverride == null) throw new TypeError('Snoozed interaction requires temporaryOverride');
    if (input.action !== 'Snoozed' && (snoozeDurationMs != null || temporaryOverride != null)) {
      throw new TypeError('Snooze state is only valid for Snoozed interaction');
    }
    if (
      temporaryOverride != null &&
      Number(temporaryOverride.snoozeUntil) !== Number(input.actedAt) + snoozeDurationMs!
    ) {
      throw new TypeError('Snoozed temporaryOverride must match actedAt + snoozeDurationMs');
    }
    const temporaryOverrideJson = serializeRoutineTemporaryOverride(temporaryOverride);

    return this.db.writeTransaction(async (tx) => {
      const replay = await tx.getOptional<RoutineInteractionRow>(
        `SELECT id, idempotency_key, identity_id, routine_id, occurrence_key, action,
                acted_at, response_latency_ms, snooze_duration_ms, metadata_json
           FROM routine_interactions WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey],
      );
      if (replay) {
        assertInteractionReplayMatches(replay, input, snoozeDurationMs);
        const occurrence = await requireOccurrenceRow(tx, input);
        return { interaction: mapInteraction(replay), occurrence: mapOccurrence(occurrence), replayed: true };
      }

      let occurrence = await requireOccurrenceRow(tx, input);
      const resolution = resolutionForInteraction(input);
      if (resolution) occurrence = await resolveOnDb(tx, { ...input, ...resolution });
      if (temporaryOverrideJson != null) {
        const existingOverride = await tx.getOptional<{ version: number }>(
          `SELECT version FROM routine_temporary_overrides
            WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
          [input.identityId, input.routineId],
        );
        const timestamp = new Date(Number(input.actedAt)).toISOString();
        if (existingOverride) {
          const updated = await tx.execute(
            `UPDATE routine_temporary_overrides
                SET override_json = ?, version = version + 1, updated_at = ?
              WHERE identity_id = ? AND routine_id = ?`,
            [temporaryOverrideJson, timestamp, input.identityId, input.routineId],
          );
          if (updated.rowsAffected !== 1) {
            throw new Error(`Routine override '${input.routineId}' update failed`);
          }
        } else {
          const inserted = await tx.execute(
            `INSERT INTO routine_temporary_overrides
              (identity_id, routine_id, override_json, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [input.identityId, input.routineId, temporaryOverrideJson, 1, timestamp, timestamp],
          );
          if (inserted.rowsAffected !== 1) {
            throw new Error(`Routine override '${input.routineId}' insert failed`);
          }
        }
      }

      const id = `RoutineInteraction_${randomUUID()}`;
      const result = await tx.execute(
        `INSERT INTO routine_interactions (
           id, idempotency_key, identity_id, routine_id, occurrence_key, action,
           acted_at, response_latency_ms, snooze_duration_ms, metadata_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          idempotencyKey,
          input.identityId,
          input.routineId,
          input.occurrenceKey,
          input.action,
          new Date(Number(input.actedAt)).toISOString(),
          responseLatencyMs,
          snoozeDurationMs,
          input.metadata == null ? null : JSON.stringify(input.metadata),
          new Date(Number(input.actedAt)).toISOString(),
        ],
      );
      if (result.rowsAffected !== 1) throw new Error(`Routine interaction '${idempotencyKey}' insert failed`);
      const interaction = await tx.get<RoutineInteractionRow>(
        `SELECT id, idempotency_key, identity_id, routine_id, occurrence_key, action,
                acted_at, response_latency_ms, snooze_duration_ms, metadata_json
           FROM routine_interactions WHERE id = ?`,
        [id],
      );
      return { interaction: mapInteraction(interaction), occurrence: mapOccurrence(occurrence), replayed: false };
    });
  }

  async listInteractions(input: { readonly identityId: string; readonly routineId: string; readonly occurrenceKey: string }): Promise<RoutineInteractionFact[]> {
    const rows = await this.db.getAll<RoutineInteractionRow>(
      `SELECT id, idempotency_key, identity_id, routine_id, occurrence_key, action,
              acted_at, response_latency_ms, snooze_duration_ms, metadata_json
         FROM routine_interactions
        WHERE identity_id = ? AND routine_id = ? AND occurrence_key = ?
        ORDER BY acted_at ASC, id ASC`,
      [input.identityId, input.routineId, input.occurrenceKey],
    );
    return rows.map(mapInteraction);
  }
}
