import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type {
  PendingTaskGoalOutboxEvent,
  TaskGoalOutboxDispatchStore,
} from '../../../application/outbox/task-goal-outbox-dispatcher';
import {
  normalizeClaimLimit,
  resolveTaskGoalOutboxDispatchStoreOptions,
  retryAvailableAt,
  type ResolvedTaskGoalOutboxDispatchStoreOptions,
  type TaskGoalOutboxDispatchStoreOptions,
} from '../../task-goal-outbox-dispatch-policy';

interface PowerSyncOutboxRow {
  id: string;
  payload: string;
  attempts: number;
  status: string;
}

/** Single-writer SQLite adapter. `available_at` doubles as the processing lease expiry. */
export class PowerSyncTaskGoalOutboxDispatchStore implements TaskGoalOutboxDispatchStore {
  private readonly options: ResolvedTaskGoalOutboxDispatchStoreOptions;

  constructor(
    private readonly db: IElectronDatabase,
    options: TaskGoalOutboxDispatchStoreOptions = {},
  ) {
    this.options = resolveTaskGoalOutboxDispatchStoreOptions(options);
  }

  async claimPending(limit: number): Promise<PendingTaskGoalOutboxEvent[]> {
    const claimLimit = normalizeClaimLimit(limit);
    if (claimLimit === 0) return [];

    const now = this.options.now();
    const nowIso = now.toISOString();
    const leaseUntilIso = new Date(now.getTime() + this.options.processingLeaseMs).toISOString();

    return this.db.writeTransaction(async (tx) => {
      const candidates = await tx.getAll<PowerSyncOutboxRow>(
        `SELECT id, payload, attempts, status
           FROM task_goal_outbox
          WHERE status IN ('PENDING', 'PROCESSING')
            AND available_at <= ?
          ORDER BY available_at ASC, created_at ASC
          LIMIT ?`,
        [nowIso, claimLimit],
      );
      const claimed: PendingTaskGoalOutboxEvent[] = [];

      for (const candidate of candidates) {
        const result = await tx.execute(
          `UPDATE task_goal_outbox
              SET status = 'PROCESSING', updated_at = ?, available_at = ?
            WHERE available_at <= ?
              AND status IN ('PENDING', 'PROCESSING')
              AND id = ?`,
          [nowIso, leaseUntilIso, nowIso, candidate.id],
        );
        if (result.rowsAffected !== 1) continue;

        claimed.push({
          eventId: candidate.id,
          payload: candidate.payload,
        });
      }

      return claimed;
    });
  }

  async markDelivered(eventId: string): Promise<void> {
    const nowIso = this.options.now().toISOString();
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE task_goal_outbox
            SET status = 'DELIVERED', dispatched_at = ?, last_error = NULL, updated_at = ?
          WHERE status = 'PROCESSING'
            AND id = ?`,
        [nowIso, nowIso, eventId],
      );
    });
  }

  async markRetry(eventId: string, error: string): Promise<void> {
    await this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<PowerSyncOutboxRow>(
        `SELECT id, payload, attempts, status
           FROM task_goal_outbox
          WHERE id = ?`,
        [eventId],
      );
      if (!row || row.status !== 'PROCESSING') return;

      const now = this.options.now();
      const nextAttempts = row.attempts + 1;
      const deadLetter = nextAttempts >= this.options.maxAttempts;
      await tx.execute(
        `UPDATE task_goal_outbox
            SET status = ?, attempts = attempts + 1, last_error = ?,
                available_at = ?, updated_at = ?
          WHERE status = 'PROCESSING'
            AND attempts = ?
            AND id = ?`,
        [
          deadLetter ? 'DEAD_LETTER' : 'PENDING',
          error,
          (deadLetter ? now : retryAvailableAt(now, row.attempts, this.options)).toISOString(),
          now.toISOString(),
          row.attempts,
          eventId,
        ],
      );
    });
  }

  async replayDeadLetter(eventId: string): Promise<boolean> {
    const nowIso = this.options.now().toISOString();
    const result = await this.db.execute(
      `UPDATE task_goal_outbox
          SET status = 'PENDING', attempts = 0, available_at = ?,
              last_error = NULL, dispatched_at = NULL, updated_at = ?
        WHERE status = 'DEAD_LETTER'
          AND id = ?`,
      [nowIso, nowIso, eventId],
    );
    return result.rowsAffected === 1;
  }
}
