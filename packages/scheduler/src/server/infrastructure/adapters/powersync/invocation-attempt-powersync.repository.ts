import type { InvocationAttempt } from '@memoflow/contracts/schedule';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { IInvocationAttemptRepository } from '../../../domain/repositories/i-invocation-attempt-repository';
import {
  PowerSyncInvocationAttemptMapper,
  type PowerSyncInvocationAttemptRow,
} from './mappers/powersync-scheduled-invocation.mapper';

/** Read repository for canonical Scheduler invocation attempts on desktop/PowerSync. */
export class PowerSyncInvocationAttemptRepository implements IInvocationAttemptRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async append(attempt: InvocationAttempt): Promise<void> {
    const row = PowerSyncInvocationAttemptMapper.toRow(attempt);
    await this.db.execute(
      `INSERT INTO invocation_attempts (
        id, identity_id, invocation_id, attempt_number, started_at, finished_at,
        outcome, result, failure_code, failure_message, failure_retryable,
        worker_id, claim_token, fencing_token, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.identity_id,
        row.invocation_id,
        row.attempt_number,
        row.started_at,
        row.finished_at,
        row.outcome,
        row.result,
        row.failure_code,
        row.failure_message,
        row.failure_retryable,
        row.worker_id,
        row.claim_token,
        row.fencing_token,
        row.created_at,
      ],
    );
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<InvocationAttempt | null> {
    const row = await this.db.getOptional<PowerSyncInvocationAttemptRow>(
      'SELECT * FROM invocation_attempts WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncInvocationAttemptMapper.toDomain(row) : null;
  }

  async listForInvocation(
    identityId: string,
    invocationId: string,
    options: { readonly limit?: number; readonly before?: number } = {},
  ): Promise<InvocationAttempt[]> {
    const clauses = ['identity_id = ?', 'invocation_id = ?'];
    const params: unknown[] = [identityId, invocationId];
    if (options.before !== undefined) {
      clauses.push('created_at < ?');
      params.push(new Date(options.before).toISOString());
    }
    const limit = Math.max(1, Math.min(200, options.limit ?? 100));
    const rows = await this.db.getAll<PowerSyncInvocationAttemptRow>(
      `SELECT * FROM invocation_attempts WHERE ${clauses.join(' AND ')} ORDER BY attempt_number DESC LIMIT ?`,
      [...params, limit],
    );
    return rows.map(PowerSyncInvocationAttemptMapper.toDomain);
  }

  async findLatestForInvocation(
    identityId: string,
    invocationId: string,
  ): Promise<InvocationAttempt | null> {
    const row = await this.db.getOptional<PowerSyncInvocationAttemptRow>(
      'SELECT * FROM invocation_attempts WHERE identity_id = ? AND invocation_id = ? ORDER BY attempt_number DESC LIMIT 1',
      [identityId, invocationId],
    );
    return row ? PowerSyncInvocationAttemptMapper.toDomain(row) : null;
  }
}
