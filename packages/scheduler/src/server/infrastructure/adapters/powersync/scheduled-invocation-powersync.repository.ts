import type { ScheduledInvocation, ScheduledInvocationStatus, SchedulingOwner, SchedulingReconcileReceipt } from '@memoflow/contracts/schedule';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IScheduledInvocationRepository, ScheduledInvocationClaim, ScheduledInvocationCompleteInput } from '../../../domain/repositories/i-scheduled-invocation-repository';
import { InvocationAttempt as InvocationAttemptEntity } from '../../../domain/entities/invocation-attempt';
import { PowerSyncInvocationAttemptMapper, PowerSyncScheduledInvocationMapper, type PowerSyncScheduledInvocationRow } from './mappers/powersync-scheduled-invocation.mapper';
import { generateUUID } from '@memoflow/utils/shared';

export class PowerSyncScheduledInvocationRepository implements IScheduledInvocationRepository {
  constructor(private readonly db: IElectronDatabase, private readonly transaction: IElectronDatabaseTransaction | null = null) {}
  private get q(): IElectronDatabaseTransaction { return this.transaction ?? this.db; }

  async findById(id: string): Promise<ScheduledInvocation | null> {
    const row = await this.q.getOptional<PowerSyncScheduledInvocationRow>('SELECT * FROM scheduled_invocations WHERE id = ? LIMIT 1', [id]);
    return row ? PowerSyncScheduledInvocationMapper.toDomain(row) : null;
  }
  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduledInvocation | null> {
    const row = await this.q.getOptional<PowerSyncScheduledInvocationRow>('SELECT * FROM scheduled_invocations WHERE id = ? AND identity_id = ? LIMIT 1', [id, identityId]);
    return row ? PowerSyncScheduledInvocationMapper.toDomain(row) : null;
  }
  async findByOwner(owner: SchedulingOwner): Promise<ScheduledInvocation[]> {
    const rows = await this.q.getAll<PowerSyncScheduledInvocationRow>('SELECT * FROM scheduled_invocations WHERE identity_id = ? AND owner_type = ? AND owner_id = ? ORDER BY run_at ASC, scheduling_key ASC', [owner.identityId, owner.type, owner.id]);
    return rows.map(PowerSyncScheduledInvocationMapper.toDomain);
  }

  async listForIdentity(
    identityId: string,
    options: {
      readonly ownerType?: string;
      readonly ownerId?: string;
      readonly status?: ScheduledInvocationStatus;
      readonly dueBefore?: number;
      readonly limit?: number;
    } = {},
  ): Promise<ScheduledInvocation[]> {
    const clauses = ["identity_id = ?"];
    const params: unknown[] = [identityId];
    if (options.ownerType !== undefined) { clauses.push("owner_type = ?"); params.push(options.ownerType); }
    if (options.ownerId !== undefined) { clauses.push("owner_id = ?"); params.push(options.ownerId); }
    if (options.status !== undefined) { clauses.push("status = ?"); params.push(options.status); }
    if (options.dueBefore !== undefined) {
      const due = new Date(options.dueBefore).toISOString();
      clauses.push("((status = \"pending\" AND run_at <= ?) OR (status = \"retry_wait\" AND next_attempt_at <= ?))");
      params.push(due, due);
    }
    const limit = Math.max(1, Math.min(200, options.limit ?? 100));
    const sql = 'SELECT * FROM scheduled_invocations WHERE ' + clauses.join(' AND ') + ' ORDER BY run_at ASC, next_attempt_at ASC, id ASC LIMIT ?';
    const rows = await this.q.getAll<PowerSyncScheduledInvocationRow>(sql, [...params, limit]);
    return rows.map(PowerSyncScheduledInvocationMapper.toDomain);
  }
  async listOwnersByType(ownerType: string): Promise<SchedulingOwner[]> {
    const rows = await this.q.getAll<{ identity_id: string; owner_type: string; owner_id: string }>(
      "SELECT DISTINCT identity_id, owner_type, owner_id FROM scheduled_invocations WHERE owner_type = ? AND status != 'superseded' ORDER BY identity_id ASC, owner_id ASC",
      [ownerType],
    );
    return rows.map((row) => ({ identityId: row.identity_id, type: row.owner_type, id: row.owner_id }));
  }
  async findRunnable(limit?: number): Promise<ScheduledInvocation[]> {
    const sql = "SELECT * FROM scheduled_invocations WHERE status IN ('pending', 'retry_wait') ORDER BY run_at ASC, next_attempt_at ASC, id ASC" + (limit === undefined ? '' : ' LIMIT ?');
    const rows = await this.q.getAll<PowerSyncScheduledInvocationRow>(sql, limit === undefined ? [] : [limit]);
    return rows.map(PowerSyncScheduledInvocationMapper.toDomain);
  }
  async findDue(now: number, limit?: number): Promise<ScheduledInvocation[]> {
    const rows = await this.q.getAll<PowerSyncScheduledInvocationRow>(`SELECT * FROM scheduled_invocations WHERE (status = 'pending' AND run_at <= ?) OR (status = 'retry_wait' AND next_attempt_at <= ?) ORDER BY COALESCE(next_attempt_at, run_at) ASC${limit === undefined ? '' : ' LIMIT ?'}`, limit === undefined ? [new Date(now).toISOString(), new Date(now).toISOString()] : [new Date(now).toISOString(), new Date(now).toISOString(), limit]);
    return rows.map(PowerSyncScheduledInvocationMapper.toDomain);
  }
  async save(invocation: ScheduledInvocation): Promise<void> {
    const row = PowerSyncScheduledInvocationMapper.toRow(invocation);
    const existing = await this.q.getOptional<{ id: string }>('SELECT id FROM scheduled_invocations WHERE id = ? LIMIT 1', [row.id]);
    const values = [row.identity_id, row.owner_type, row.owner_id, row.scheduling_key, row.handler_key, row.payload_version, row.payload, row.run_at, row.source_revision, row.retry_enabled, row.max_retries, row.initial_delay_ms, row.max_delay_ms, row.backoff_multiplier, row.priority, row.timeout_ms, row.status, row.attempt_count, row.next_attempt_at, row.claim_token, row.claim_expires_at, row.fencing_token, row.name, row.tags, row.updated_at];
    if (existing) await this.q.execute(`UPDATE scheduled_invocations SET identity_id=?, owner_type=?, owner_id=?, scheduling_key=?, handler_key=?, payload_version=?, payload=?, run_at=?, source_revision=?, retry_enabled=?, max_retries=?, initial_delay_ms=?, max_delay_ms=?, backoff_multiplier=?, priority=?, timeout_ms=?, status=?, attempt_count=?, next_attempt_at=?, claim_token=?, claim_expires_at=?, fencing_token=?, name=?, tags=?, updated_at=? WHERE id=?`, [...values, row.id]);
    else await this.q.execute(`INSERT INTO scheduled_invocations (id, identity_id, owner_type, owner_id, scheduling_key, handler_key, payload_version, payload, run_at, source_revision, retry_enabled, max_retries, initial_delay_ms, max_delay_ms, backoff_multiplier, priority, timeout_ms, status, attempt_count, next_attempt_at, claim_token, claim_expires_at, fencing_token, name, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, ...values.slice(0, 24), row.created_at, row.updated_at]);
  }
  async supersedeStale(owner: SchedulingOwner, keepSchedulingKeys: readonly string[]): Promise<number> {
    const rows = await this.q.getAll<{ id: string }>('SELECT id FROM scheduled_invocations WHERE identity_id = ? AND owner_type = ? AND owner_id = ?' + (keepSchedulingKeys.length ? ` AND scheduling_key NOT IN (${keepSchedulingKeys.map(() => '?').join(',')})` : '') + ' AND status != ?', [owner.identityId, owner.type, owner.id, ...keepSchedulingKeys, 'superseded']);
    if (rows.length) await this.q.execute('UPDATE scheduled_invocations SET status = ?, claim_token = NULL, claim_expires_at = NULL, next_attempt_at = NULL WHERE id IN (' + rows.map(() => '?').join(',') + ')', ['superseded', ...rows.map((r) => r.id)]);
    return rows.length;
  }
  async claimAndStart(input: { invocationId: string; identityId: string; claimToken: string; claimExpiresAt: number; now: number; workerId?: string | null }): Promise<ScheduledInvocationClaim | null> {
    const result = await this.q.execute(`UPDATE scheduled_invocations SET status = 'running', attempt_count = attempt_count + 1, next_attempt_at = NULL, claim_token = ?, claim_expires_at = ?, fencing_token = fencing_token + 1 WHERE id = ? AND identity_id = ? AND ((status = 'pending' AND run_at <= ?) OR (status = 'retry_wait' AND next_attempt_at <= ?))`, [input.claimToken, new Date(input.claimExpiresAt).toISOString(), input.invocationId, input.identityId, new Date(input.now).toISOString(), new Date(input.now).toISOString()]);
    if (result.rowsAffected !== 1) return null;
    const row = await this.q.get<PowerSyncScheduledInvocationRow>('SELECT * FROM scheduled_invocations WHERE id = ?', [input.invocationId]);
    const attempt = InvocationAttemptEntity.start({ identityId: row.identity_id, invocationId: row.id, attemptNumber: row.attempt_count, startedAt: input.now, workerId: input.workerId, claimToken: input.claimToken, fencingToken: row.fencing_token, id: generateUUID() });
    const a = PowerSyncInvocationAttemptMapper.toRow(attempt.toState());
    await this.q.execute('INSERT INTO invocation_attempts (id, identity_id, invocation_id, attempt_number, started_at, finished_at, outcome, result, failure_code, failure_message, failure_retryable, worker_id, claim_token, fencing_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [a.id, a.identity_id, a.invocation_id, a.attempt_number, a.started_at, a.finished_at, a.outcome, a.result, a.failure_code, a.failure_message, a.failure_retryable, a.worker_id, a.claim_token, a.fencing_token, a.created_at]);
    return { invocation: PowerSyncScheduledInvocationMapper.toDomain(row), attempt: attempt.toState() };
  }
  async completeAttempt(input: ScheduledInvocationCompleteInput): Promise<boolean> {
    const result = await this.q.execute('UPDATE scheduled_invocations SET status = ?, next_attempt_at = ?, claim_token = NULL, claim_expires_at = NULL WHERE id = ? AND identity_id = ? AND status = ? AND claim_token = ? AND fencing_token = ?', [input.status, input.nextAttemptAt === null ? null : new Date(input.nextAttemptAt).toISOString(), input.invocationId, input.identityId, 'running', input.claimToken, input.fencingToken]);
    if (result.rowsAffected !== 1) return false;
    const attempt = await this.q.execute('UPDATE invocation_attempts SET finished_at = ?, outcome = ?, result = ?, failure_code = ?, failure_message = ?, failure_retryable = ? WHERE invocation_id = ? AND attempt_number = ? AND claim_token = ? AND fencing_token = ? AND finished_at IS NULL', [new Date(input.finishedAt).toISOString(), input.outcome, input.result === undefined || input.result === null ? null : JSON.stringify(input.result), input.failureCode ?? null, input.failureMessage ?? null, input.failureRetryable === undefined || input.failureRetryable === null ? null : input.failureRetryable ? 1 : 0, input.invocationId, input.attemptNumber, input.claimToken, input.fencingToken]);
    if (attempt.rowsAffected !== 1) throw new Error('Invocation attempt completion failed after state CAS.');
    return true;
  }
  async recoverExpiredClaims(now: number, limit?: number): Promise<number> {
    const result = await this.q.execute(`UPDATE scheduled_invocations SET status = CASE WHEN retry_enabled = 1 AND attempt_count <= max_retries THEN 'retry_wait' ELSE 'dead_letter' END, next_attempt_at = CASE WHEN retry_enabled = 1 AND attempt_count <= max_retries THEN ? ELSE NULL END, claim_token = NULL, claim_expires_at = NULL WHERE status = 'running' AND claim_expires_at < ?${limit === undefined ? '' : ' LIMIT ' + Math.max(1, Math.floor(limit))}`, [new Date(now).toISOString(), new Date(now).toISOString()]);
    if (result.rowsAffected === undefined) throw new Error('Expired claim recovery did not report affected rows.');
    return result.rowsAffected;
  }
  async appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void> {
    await this.q.execute('INSERT INTO scheduling_reconcile_operations (id, identity_id, owner_type, owner_id, status, desired_count, created_count, updated_count, deleted_count, unchanged_count, failure_code, failure_message, failure_retryable, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [receipt.operationId, receipt.owner.identityId, receipt.owner.type, receipt.owner.id, receipt.status, receipt.desiredCount, receipt.createdCount, receipt.updatedCount, receipt.deletedCount, receipt.unchangedCount, receipt.failure?.code ?? null, receipt.failure?.message ?? null, receipt.failure?.retryable === undefined ? null : receipt.failure.retryable ? 1 : 0, new Date(receipt.startedAt).toISOString(), new Date(receipt.finishedAt).toISOString(), new Date(receipt.finishedAt).toISOString()]);
  }
  async withTransaction<T>(fn: (repository: IScheduledInvocationRepository) => Promise<T>): Promise<T> { if (this.transaction) return fn(this); return this.db.writeTransaction((tx) => fn(new PowerSyncScheduledInvocationRepository(this.db, tx))); }
}
