import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { PowerSyncTaskGoalOutboxDispatchStore } from './powersync-task-goal-outbox-dispatch-store';

interface OutboxRow {
  id: string;
  payload: string;
  status: string;
  attempts: number;
  available_at: string;
  last_error: string | null;
  dispatched_at: string | null;
  updated_at: string;
}

const payload = {
  eventId: 'event-1',
  schemaVersion: 2 as const,
  eventType: 'task.goal-progress-requested' as const,
  identityId: 'identity-1',
  taskOccurrenceId: 'instance-1',
  taskPlanId: 'template-1',
  goalId: 'goal-1',
  keyResultId: 'kr-1',
  value: 1,
  source: { type: 'TaskOccurrence' as const, id: 'instance-1' },
  action: 'apply' as const,
  taskTitle: 'Ship it',
  occurredAt: Date.parse('2026-08-01T00:00:00.000Z'),
};

class FakeOutboxDatabase implements IElectronDatabase {
  constructor(readonly rows: OutboxRow[]) {}

  async execute(sql: string, parameters: unknown[] = []): Promise<IElectronDatabaseQueryResult> {
    return this.executeAgainst(sql, parameters);
  }

  async getAll<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
    if (!sql.includes('FROM task_goal_outbox')) return [];
    expect(sql).not.toContain('event_id');
    expect(sql).toContain('SELECT id, payload, attempts, status');
    const now = String(parameters[0]);
    const limit = Number(parameters[1]);
    return this.rows
      .filter(
        (row) =>
          (row.status === 'PENDING' || row.status === 'PROCESSING') && row.available_at <= now,
      )
      .sort((left, right) => left.available_at.localeCompare(right.available_at))
      .slice(0, limit) as T[];
  }

  async getOptional<T>(sql: string, parameters: unknown[] = []): Promise<T | null> {
    if (!sql.includes('FROM task_goal_outbox')) return null;
    expect(sql).not.toContain('event_id');
    expect(sql).toContain('WHERE id = ?');
    const row = this.rows.find((candidate) => candidate.id === String(parameters[0]));
    return (row ?? null) as T | null;
  }

  async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
    const row = await this.getOptional<T>(sql, parameters);
    if (!row) throw new Error('Row not found');
    return row;
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }

  private async executeAgainst(
    sql: string,
    parameters: unknown[],
  ): Promise<IElectronDatabaseQueryResult> {
    if (sql.includes('task_goal_outbox')) {
      expect(sql).not.toContain('event_id');
      expect(sql).toMatch(/\bid = \?/u);
    }
    const eventId = String(parameters.at(-1));
    const row = this.rows.find((candidate) => candidate.id === eventId);
    if (!row) return { rowsAffected: 0 };

    if (sql.includes("SET status = 'DELIVERED'")) {
      if (row.status !== 'PROCESSING') return { rowsAffected: 0 };
      row.status = 'DELIVERED';
      row.dispatched_at = String(parameters[0]);
      row.last_error = null;
      row.updated_at = String(parameters[0]);
      return { rowsAffected: 1 };
    }

    if (sql.includes("SET status = 'PENDING', attempts = 0")) {
      if (row.status !== 'DEAD_LETTER') return { rowsAffected: 0 };
      row.status = 'PENDING';
      row.attempts = 0;
      row.available_at = String(parameters[0]);
      row.last_error = null;
      row.dispatched_at = null;
      row.updated_at = String(parameters[1]);
      return { rowsAffected: 1 };
    }

    if (sql.includes('attempts = attempts + 1')) {
      const expectedAttempts = Number(parameters[4]);
      if (row.status !== 'PROCESSING' || row.attempts !== expectedAttempts) {
        return { rowsAffected: 0 };
      }
      row.status = String(parameters[0]);
      row.attempts += 1;
      row.last_error = String(parameters[1]);
      row.available_at = String(parameters[2]);
      row.updated_at = String(parameters[3]);
      return { rowsAffected: 1 };
    }

    if (sql.includes("SET status = 'PROCESSING'")) {
      const now = String(parameters[0]);
      if (!['PENDING', 'PROCESSING'].includes(row.status) || row.available_at > now) {
        return { rowsAffected: 0 };
      }
      row.status = 'PROCESSING';
      row.available_at = String(parameters[1]);
      row.updated_at = now;
      return { rowsAffected: 1 };
    }

    throw new Error(`Unsupported SQL: ${sql}`);
  }
}

function pendingRow(): OutboxRow {
  return {
    id: payload.eventId,
    payload: JSON.stringify(payload),
    status: 'PENDING',
    attempts: 0,
    available_at: '2026-08-01T00:00:00.000Z',
    last_error: null,
    dispatched_at: null,
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

describe('PowerSyncTaskGoalOutboxDispatchStore', () => {
  it('leases pending events so an immediate second claim cannot duplicate delivery', async () => {
    let now = new Date('2026-08-01T00:01:00.000Z');
    const db = new FakeOutboxDatabase([pendingRow()]);
    const store = new PowerSyncTaskGoalOutboxDispatchStore(db, {
      now: () => now,
      processingLeaseMs: 30_000,
    });

    await expect(store.claimPending(10)).resolves.toEqual([
      { eventId: payload.eventId, payload: JSON.stringify(payload) },
    ]);
    await expect(store.claimPending(10)).resolves.toEqual([]);

    now = new Date('2026-08-01T00:01:31.000Z');
    await expect(store.claimPending(10)).resolves.toHaveLength(1);
  });

  it('marks a processing event delivered with its dispatch time', async () => {
    const row = pendingRow();
    row.status = 'PROCESSING';
    const db = new FakeOutboxDatabase([row]);
    const store = new PowerSyncTaskGoalOutboxDispatchStore(db, {
      now: () => new Date('2026-08-01T00:02:00.000Z'),
    });

    await store.markDelivered(payload.eventId);

    expect(row).toMatchObject({
      status: 'DELIVERED',
      dispatched_at: '2026-08-01T00:02:00.000Z',
      last_error: null,
    });
  });

  it('returns a failed event to pending with capped exponential backoff', async () => {
    const row = pendingRow();
    row.status = 'PROCESSING';
    row.attempts = 10;
    const db = new FakeOutboxDatabase([row]);
    const store = new PowerSyncTaskGoalOutboxDispatchStore(db, {
      now: () => new Date('2026-08-01T00:03:00.000Z'),
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
      maxAttempts: 20,
    });

    await store.markRetry(payload.eventId, 'Goal unavailable');

    expect(row).toMatchObject({
      status: 'PENDING',
      attempts: 11,
      last_error: 'Goal unavailable',
      available_at: '2026-08-01T00:03:08.000Z',
    });
  });

  it('dead-letters an event after the configured final attempt', async () => {
    const row = pendingRow();
    row.status = 'PROCESSING';
    row.attempts = 2;
    const db = new FakeOutboxDatabase([row]);
    const store = new PowerSyncTaskGoalOutboxDispatchStore(db, {
      now: () => new Date('2026-08-01T00:04:00.000Z'),
      maxAttempts: 3,
    });

    await store.markRetry(payload.eventId, 'Permanent contract failure');

    expect(row).toMatchObject({
      status: 'DEAD_LETTER',
      attempts: 3,
      last_error: 'Permanent contract failure',
      available_at: '2026-08-01T00:04:00.000Z',
    });
    await expect(store.claimPending(10)).resolves.toEqual([]);

    await expect(store.replayDeadLetter(payload.eventId)).resolves.toBe(true);
    expect(row).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      last_error: null,
    });
    await expect(store.replayDeadLetter(payload.eventId)).resolves.toBe(false);
  });
});
