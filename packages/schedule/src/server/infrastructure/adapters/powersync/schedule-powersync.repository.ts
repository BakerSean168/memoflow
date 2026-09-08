import type { IScheduleRepository, ScheduleRebuildOutboxDTO } from '../../../domain/repositories/i-schedule-repository';
import type { CalendarEntry } from '../../../domain/aggregates/calendar-entry';
import { LeaseLostError } from '@memoflow/patterns/lease';
import {
  PowerSyncScheduleMapper,
  type PowerSyncScheduleRow,
} from './mappers/powersync-schedule.mapper';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { toResultErrorException } from '@memoflow/contracts/result';

type Queryable = IElectronDatabaseTransaction;

type ScheduleRebuildOutboxRow = {
  id: string;
  identity_id: string;
  schedule_id: string | null;
  start_time: string;
  end_time: string;
  source_revision: string | number;
  idempotency_key: string | null;
  status: string;
  attempts: string | number;
  claim_token: string | null;
  claimed_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
};

type ScheduleDomainEventOutboxRow = {
  id: string;
  identity_id: string;
  schedule_id: string;
  event_type: string;
  payload: string;
  status: string;
  attempts: string | number;
  claim_token: string | null;
  claimed_at: string | null;
  next_attempt_at: string | null;
  published_at: string | null;
  last_error: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export class PowerSyncScheduleRepository implements IScheduleRepository {
  constructor(
    private readonly db: Queryable & { writeTransaction?<T>(cb: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T> },
  ) {}

  private async ensureOutboxTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS schedule_rebuild_outbox (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        schedule_id TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        source_revision INTEGER NOT NULL DEFAULT 1,
        idempotency_key TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT,
        claimed_at TEXT,
        next_attempt_at TEXT,
        last_error TEXT,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS schedule_domain_event_outbox (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        schedule_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT,
        claimed_at TEXT,
        next_attempt_at TEXT,
        published_at TEXT,
        last_error TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async flushDomainEvents(schedule: CalendarEntry): Promise<void> {
    await this.ensureOutboxTable();
    const events = schedule.domainEvents;
    if (events.length === 0) return;

    const now = new Date().toISOString();
    for (const evt of events) {
      const idempotencyKey = `domain:${schedule.identityId}:${schedule.id}:${schedule.version}:${evt.eventType}`;
      const id = `outbox-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.db.execute(
        `INSERT OR IGNORE INTO schedule_domain_event_outbox (
          id, identity_id, schedule_id, event_type, payload, status, attempts, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
        [
          id,
          String(schedule.identityId),
          String(schedule.id),
          evt.eventType,
          JSON.stringify(evt.payload ?? null),
          idempotencyKey,
          now,
          now,
        ],
      );
    }
  }

  async save(schedule: CalendarEntry, expectedVersion?: number): Promise<void> {
    await this.flushDomainEvents(schedule);
    const data = PowerSyncScheduleMapper.toPersistence(schedule);
    const existing = await this.db.getOptional<{ id: string; version: number }>(
      'SELECT id, version FROM schedules WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (existing) {
      if (expectedVersion !== undefined) {
        const res = await this.db.execute(
          `UPDATE schedules
           SET title = ?,
               description = ?,
               start_time = ?,
               end_time = ?,
               duration = ?,
               has_conflict = ?,
               conflicting_schedules = ?,
               priority = ?,
               location = ?,
               attendees = ?,
               version = ?,
               updated_at = ?
           WHERE id = ? AND identity_id = ? AND version = ?`,
          [
            data.title,
            data.description,
            data.startTime,
            data.endTime,
            data.duration,
            data.hasConflict,
            data.conflictingSchedules,
            data.priority,
            data.location,
            data.attendees,
            expectedVersion + 1,
            data.updatedAt,
            data.id,
            data.identityId,
            expectedVersion,
          ],
        );

        if (res.rowsAffected === 0) {
          const current = await this.db.getOptional<{ version: number }>(
            'SELECT version FROM schedules WHERE id = ? AND identity_id = ? LIMIT 1',
            [data.id, data.identityId],
          );
          if (!current) {
            throw toResultErrorException(
              { code: 'NOT_FOUND', message: `Schedule event ${data.id} not found` },
              404,
            );
          }
          throw toResultErrorException(
            {
              code: 'CONFLICT',
              message: `Schedule event ${data.id} version conflict (expected ${expectedVersion}, current version is ${current.version})`,
              context: { currentVersion: current.version, expectedVersion },
            },
            409,
          );
        }
        return;
      }

      await this.db.execute(
        `UPDATE schedules
         SET title = ?,
             description = ?,
             start_time = ?,
             end_time = ?,
             duration = ?,
             has_conflict = ?,
             conflicting_schedules = ?,
             priority = ?,
             location = ?,
             attendees = ?,
             version = ?,
             updated_at = ?
         WHERE id = ? AND identity_id = ?`,
        [
          data.title,
          data.description,
          data.startTime,
          data.endTime,
          data.duration,
          data.hasConflict,
          data.conflictingSchedules,
          data.priority,
          data.location,
          data.attendees,
          data.version,
          data.updatedAt,
          data.id,
          data.identityId,
        ],
      );
    } else {
      await this.db.execute(
        `INSERT INTO schedules (
          id, identity_id, title, description, start_time, end_time, duration,
          has_conflict, conflicting_schedules, priority, location, attendees, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.identityId,
          data.title,
          data.description,
          data.startTime,
          data.endTime,
          data.duration,
          data.hasConflict,
          data.conflictingSchedules,
          data.priority,
          data.location,
          data.attendees,
      data.version,
      data.createdAt,
      data.updatedAt,
    ],
      );
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null> {
    const row = await this.db.getOptional<PowerSyncScheduleRow>(
      'SELECT * FROM schedules WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncScheduleMapper.toDomain(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<CalendarEntry[]> {
    const rows = await this.db.getAll<PowerSyncScheduleRow>(
      'SELECT * FROM schedules WHERE identity_id = ? ORDER BY start_time ASC',
      [identityId],
    );
    return rows.map((row) => PowerSyncScheduleMapper.toDomain(row));
  }

  async deleteById(identityId: string, id: string, expectedVersion: number): Promise<void> {
    const res = await this.db.execute(
      'DELETE FROM schedules WHERE id = ? AND identity_id = ? AND version = ?',
      [id, identityId, expectedVersion],
    );
    if (res.rowsAffected !== 1) {
      const current = await this.db.getOptional<{ version: number }>(
        'SELECT version FROM schedules WHERE id = ? AND identity_id = ? LIMIT 1',
        [id, identityId],
      );
      if (!current) {
        throw toResultErrorException(
          { code: 'NOT_FOUND', message: `Schedule event ${id} not found for identity` },
          404,
        );
      }
      throw toResultErrorException(
        {
          code: 'CONFLICT',
          message: `Schedule event ${id} version conflict (expected ${expectedVersion}, current version is ${current.version})`,
          context: { currentVersion: current.version, expectedVersion },
        },
        409,
      );
    }
  }

  async deleteAggregate(entry: CalendarEntry, expectedVersion: number): Promise<void> {
    await this.flushDomainEvents(entry);
    await this.deleteById(entry.identityId, entry.id, expectedVersion);
  }

  async findByTimeRange(
    identityId: string,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<CalendarEntry[]> {
    const rows = await this.db.getAll<PowerSyncScheduleRow>(
      `SELECT * FROM schedules
       WHERE identity_id = ?
         AND start_time < ?
         AND end_time > ?
         ${excludeId ? 'AND id != ?' : ''}
       ORDER BY start_time ASC`,
      excludeId
        ? [
            identityId,
            new Date(endTime).toISOString(),
            new Date(startTime).toISOString(),
            excludeId,
          ]
        : [identityId, new Date(endTime).toISOString(), new Date(startTime).toISOString()],
    );
    return rows.map((row) => PowerSyncScheduleMapper.toDomain(row));
  }

  async updateConflictProjection(
    identityId: string,
    id: string,
    hasConflict: boolean,
    conflictingEntries: string[] | null,
    sourceRevision: number,
  ): Promise<void> {
    const current = await this.db.getOptional<{ version: number; has_conflict: number | boolean | string; conflicting_schedules: string | null }>(
      'SELECT version, has_conflict, conflicting_schedules FROM schedules WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    if (!current) return;
    if (current.version > sourceRevision) return;

    const newConflictingStr = conflictingEntries && conflictingEntries.length > 0
      ? JSON.stringify(conflictingEntries)
      : null;
    const currentHasConflict = Number(current.has_conflict) === 1;

    if (currentHasConflict === hasConflict && current.conflicting_schedules === newConflictingStr) {
      return;
    }

    await this.db.execute(
      `UPDATE schedules
       SET has_conflict = ?, conflicting_schedules = ?
       WHERE id = ? AND identity_id = ? AND version <= ?`,
      [hasConflict ? 1 : 0, newConflictingStr, id, identityId, sourceRevision],
    );
  }

  async createRebuildOutbox(item: {
    identityId: string;
    scheduleId?: string;
    startTime: number;
    endTime: number;
    sourceRevision: number;
    idempotencyKey?: string;
  }): Promise<void> {
    await this.ensureOutboxTable();
    const key = item.idempotencyKey ?? `rebuild:${item.identityId}:${item.sourceRevision}`;
    const now = new Date().toISOString();

    const existing = await this.db.getOptional<{ id: string }>(
      'SELECT id FROM schedule_rebuild_outbox WHERE idempotency_key = ? LIMIT 1',
      [key],
    );

    if (existing) {
      await this.db.execute(
        `UPDATE schedule_rebuild_outbox
         SET start_time = ?, end_time = ?, source_revision = ?, status = 'pending', updated_at = ?
         WHERE idempotency_key = ?`,
        [
          new Date(item.startTime).toISOString(),
          new Date(item.endTime).toISOString(),
          item.sourceRevision,
          now,
          key,
        ],
      );
    } else {
      const id = `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.db.execute(
        `INSERT INTO schedule_rebuild_outbox (
          id, identity_id, schedule_id, start_time, end_time, source_revision, idempotency_key, status, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
        [
          id,
          item.identityId,
          item.scheduleId ?? null,
          new Date(item.startTime).toISOString(),
          new Date(item.endTime).toISOString(),
          item.sourceRevision,
          key,
          now,
          now,
        ],
      );
    }
  }

  async fetchPendingRebuildOutbox(
    identityId?: string,
    limit = 50,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    await this.ensureOutboxTable();
    const sql = identityId
      ? 'SELECT * FROM schedule_rebuild_outbox WHERE status = ? AND identity_id = ? ORDER BY created_at ASC LIMIT ?'
      : 'SELECT * FROM schedule_rebuild_outbox WHERE status = ? ORDER BY created_at ASC LIMIT ?';
    const params = identityId ? ['pending', identityId, limit] : ['pending', limit];

    const rows = await this.db.getAll<ScheduleRebuildOutboxRow>(sql, params);
    return rows.map(mapRebuildOutboxRowToDTO);
  }

  async fetchRebuildTimeline(
    identityId: string,
    limit = 100,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    await this.ensureOutboxTable();
    if (!identityId) {
      throw new Error('identityId is required for rebuild timeline query');
    }
    const rows = await this.db.getAll<ScheduleRebuildOutboxRow>(
      `SELECT * FROM schedule_rebuild_outbox
       WHERE identity_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [identityId, limit],
    );
    return rows.map(mapRebuildOutboxRowToDTO);
  }

  async replayRebuildOutbox(input: {
    identityId: string;
    operationId: string;
  }): Promise<ScheduleRebuildOutboxDTO> {
    await this.ensureOutboxTable();
    if (!input.identityId || !input.operationId) {
      throw new Error('identityId and operationId are required for rebuild replay');
    }
    const existing = await this.db.getOptional<ScheduleRebuildOutboxRow>(
      `SELECT * FROM schedule_rebuild_outbox
       WHERE id = ? AND identity_id = ? LIMIT 1`,
      [input.operationId, input.identityId],
    );
    if (!existing) {
      throw new Error(
        `Rebuild outbox operation '${input.operationId}' not found for this identity`,
      );
    }
    if (existing.status !== 'failed') {
      throw new Error(
        `Rebuild outbox operation '${input.operationId}' is not replayable (status: ${existing.status})`,
      );
    }
    const nowIso = new Date().toISOString();
    await this.db.execute(
      `UPDATE schedule_rebuild_outbox
       SET status = 'pending', claim_token = NULL, claimed_at = NULL, next_attempt_at = NULL, updated_at = ?
       WHERE id = ? AND identity_id = ?`,
      [nowIso, input.operationId, input.identityId],
    );
    const updated = await this.db.getOptional<ScheduleRebuildOutboxRow>(
      `SELECT * FROM schedule_rebuild_outbox WHERE id = ? LIMIT 1`,
      [input.operationId],
    );
    if (!updated) {
      throw new Error(`Rebuild outbox operation '${input.operationId}' disappeared during replay`);
    }
    return mapRebuildOutboxRowToDTO(updated);
  }

  async claimRebuildOutboxItems(
    claimToken: string,
    limit = 50,
    timeoutMs = 30000,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    await this.ensureOutboxTable();
    const nowIso = new Date().toISOString();
    const thresholdIso = new Date(Date.now() - timeoutMs).toISOString();

    const candidates = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM schedule_rebuild_outbox
       WHERE status = 'pending'
          OR (status = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
          OR (status = 'processing' AND claimed_at <= ?)
       ORDER BY created_at ASC LIMIT ?`,
      [nowIso, thresholdIso, limit],
    );

    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.id);
    const placeholders = ids.map(() => '?').join(',');

    await this.db.execute(
      `UPDATE schedule_rebuild_outbox
       SET status = 'processing', claim_token = ?, claimed_at = ?, updated_at = ?
       WHERE id IN (${placeholders})
         AND (status = 'pending'
              OR (status = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
              OR (status = 'processing' AND claimed_at <= ?))`,
      [claimToken, nowIso, nowIso, ...ids, thresholdIso, thresholdIso],
    );

    const claimed = await this.db.getAll<ScheduleRebuildOutboxRow>(
      `SELECT * FROM schedule_rebuild_outbox
       WHERE id IN (${placeholders}) AND claim_token = ? AND status = 'processing'`,
      [...ids, claimToken],
    );

    return claimed.map((r) => ({
      id: r.id,
      identityId: r.identity_id,
      scheduleId: r.schedule_id,
      startTime: new Date(r.start_time),
      endTime: new Date(r.end_time),
      sourceRevision: Number(r.source_revision),
      idempotencyKey: r.idempotency_key,
      status: r.status,
      attempts: Number(r.attempts),
      claimToken: r.claim_token,
      claimedAt: r.claimed_at ? new Date(r.claimed_at) : null,
      nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at) : null,
      lastError: r.last_error ?? null,
      processedAt: r.processed_at ? new Date(r.processed_at) : null,
      createdAt: new Date(r.created_at),
    }));
  }

  async markRebuildOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    await this.ensureOutboxTable();
    const nowIso = new Date().toISOString();
    const existing = await this.db.getOptional<{ attempts: number }>(
      'SELECT attempts FROM schedule_rebuild_outbox WHERE id = ? AND claim_token = ? AND status = ? LIMIT 1',
      [id, claimToken, 'processing'],
    );
    if (!existing) {
      throw new LeaseLostError(`Rebuild outbox item ${id} is not owned by this claim token (lease lost)`);
    }

    if (!error) {
      const res = await this.db.execute(
        `UPDATE schedule_rebuild_outbox
         SET status = 'completed', processed_at = ?, claim_token = NULL, last_error = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nowIso, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
      return;
    }

    const nextAttempts = Number(existing.attempts) + 1;
    if (nextAttempts >= maxAttempts) {
      const res = await this.db.execute(
        `UPDATE schedule_rebuild_outbox
         SET status = 'failed', attempts = ?, last_error = ?, claim_token = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nextAttempts, error, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    } else {
      const backoffMs = Math.pow(2, nextAttempts) * 1000;
      const nextAttemptIso = new Date(Date.now() + backoffMs).toISOString();
      const res = await this.db.execute(
        `UPDATE schedule_rebuild_outbox
         SET status = 'retry', attempts = ?, next_attempt_at = ?, last_error = ?, claim_token = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nextAttempts, nextAttemptIso, error, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    }
  }

  async createDomainEventOutbox(
    events: {
      identityId: string;
      scheduleId: string;
      eventType: string;
      payload: string;
      idempotencyKey: string;
    }[],
  ): Promise<void> {
    await this.ensureOutboxTable();
    if (events.length === 0) return;
    const now = new Date().toISOString();
    for (const evt of events) {
      const id = `outbox-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.db.execute(
        `INSERT OR IGNORE INTO schedule_domain_event_outbox (
          id, identity_id, schedule_id, event_type, payload, status, attempts, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
        [
          id,
          evt.identityId,
          evt.scheduleId,
          evt.eventType,
          evt.payload,
          evt.idempotencyKey,
          now,
          now,
        ],
      );
    }
  }

  async fetchPendingDomainEventOutbox(
    identityId?: string,
    limit = 50,
  ): Promise<import('../../../domain/repositories/i-schedule-repository').ScheduleDomainEventOutboxDTO[]> {
    await this.ensureOutboxTable();
    const sql = identityId
      ? 'SELECT * FROM schedule_domain_event_outbox WHERE status = ? AND identity_id = ? ORDER BY created_at ASC LIMIT ?'
      : 'SELECT * FROM schedule_domain_event_outbox WHERE status = ? ORDER BY created_at ASC LIMIT ?';
    const params = identityId ? ['pending', identityId, limit] : ['pending', limit];

    const rows = await this.db.getAll<ScheduleDomainEventOutboxRow>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      identityId: r.identity_id,
      scheduleId: r.schedule_id,
      eventType: r.event_type,
      payload: r.payload,
      status: r.status,
      attempts: Number(r.attempts),
      claimToken: r.claim_token ?? null,
      claimedAt: r.claimed_at ? new Date(r.claimed_at) : null,
      nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at) : null,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      lastError: r.last_error ?? null,
      idempotencyKey: r.idempotency_key,
      createdAt: new Date(r.created_at),
    }));
  }

  async claimDomainEventOutboxItems(
    claimToken: string,
    limit = 50,
    timeoutMs = 30000,
  ): Promise<import('../../../domain/repositories/i-schedule-repository').ScheduleDomainEventOutboxDTO[]> {
    await this.ensureOutboxTable();
    const nowIso = new Date().toISOString();
    const thresholdIso = new Date(Date.now() - timeoutMs).toISOString();

    const candidates = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM schedule_domain_event_outbox
       WHERE status = 'pending'
          OR (status = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
          OR (status = 'processing' AND claimed_at <= ?)
       ORDER BY created_at ASC LIMIT ?`,
      [nowIso, thresholdIso, limit],
    );

    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.id);
    const placeholders = ids.map(() => '?').join(',');

    await this.db.execute(
      `UPDATE schedule_domain_event_outbox
       SET status = 'processing', claim_token = ?, claimed_at = ?, updated_at = ?
       WHERE id IN (${placeholders})
         AND (status = 'pending'
              OR (status = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
              OR (status = 'processing' AND claimed_at <= ?))`,
      [claimToken, nowIso, nowIso, ...ids, thresholdIso, thresholdIso],
    );

    const claimed = await this.db.getAll<ScheduleDomainEventOutboxRow>(
      `SELECT * FROM schedule_domain_event_outbox
       WHERE id IN (${placeholders}) AND claim_token = ? AND status = 'processing'`,
      [...ids, claimToken],
    );

    return claimed.map((r) => ({
      id: r.id,
      identityId: r.identity_id,
      scheduleId: r.schedule_id,
      eventType: r.event_type,
      payload: r.payload,
      status: r.status,
      attempts: Number(r.attempts),
      claimToken: r.claim_token,
      claimedAt: r.claimed_at ? new Date(r.claimed_at) : null,
      nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at) : null,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      lastError: r.last_error ?? null,
      idempotencyKey: r.idempotency_key,
      createdAt: new Date(r.created_at),
    }));
  }

  async markDomainEventOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    await this.ensureOutboxTable();
    const nowIso = new Date().toISOString();
    const existing = await this.db.getOptional<{ attempts: number }>(
      'SELECT attempts FROM schedule_domain_event_outbox WHERE id = ? AND claim_token = ? AND status = ? LIMIT 1',
      [id, claimToken, 'processing'],
    );
    if (!existing) {
      throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
    }

    if (!error) {
      const res = await this.db.execute(
        `UPDATE schedule_domain_event_outbox
         SET status = 'completed', published_at = ?, claim_token = NULL, last_error = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nowIso, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
      return;
    }

    const nextAttempts = Number(existing.attempts) + 1;
    if (nextAttempts >= maxAttempts) {
      const res = await this.db.execute(
        `UPDATE schedule_domain_event_outbox
         SET status = 'failed', attempts = ?, last_error = ?, claim_token = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nextAttempts, error, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    } else {
      const backoffMs = Math.pow(2, nextAttempts) * 1000;
      const nextAttemptIso = new Date(Date.now() + backoffMs).toISOString();
      const res = await this.db.execute(
        `UPDATE schedule_domain_event_outbox
         SET status = 'retry', attempts = ?, next_attempt_at = ?, last_error = ?, claim_token = NULL, updated_at = ?
         WHERE id = ? AND claim_token = ? AND status = 'processing'`,
        [nextAttempts, nextAttemptIso, error, nowIso, id, claimToken],
      );
      if (res.rowsAffected === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    }
  }

  async withTransaction<T>(fn: (repo: IScheduleRepository) => Promise<T>): Promise<T> {
    if (!this.db.writeTransaction) {
      throw new Error('PowerSync repository requires transaction support (writeTransaction missing)');
    }
    return this.db.writeTransaction(async (tx) => {
      const txRepo = new PowerSyncScheduleRepository(tx);
      return fn(txRepo);
    });
  }
}

function mapRebuildOutboxRowToDTO(r: ScheduleRebuildOutboxRow): ScheduleRebuildOutboxDTO {
  return {
    id: r.id,
    identityId: r.identity_id,
    scheduleId: r.schedule_id,
    startTime: new Date(r.start_time),
    endTime: new Date(r.end_time),
    sourceRevision: Number(r.source_revision),
    idempotencyKey: r.idempotency_key,
    status: r.status,
    attempts: Number(r.attempts),
    claimToken: r.claim_token ?? null,
    claimedAt: r.claimed_at ? new Date(r.claimed_at) : null,
    nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at) : null,
    lastError: r.last_error ?? null,
    processedAt: r.processed_at ? new Date(r.processed_at) : null,
    createdAt: new Date(r.created_at),
  };
}
