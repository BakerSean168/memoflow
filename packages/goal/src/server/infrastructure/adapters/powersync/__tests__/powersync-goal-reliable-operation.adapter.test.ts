import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { PowerSyncGoalReliableOperationAdapter } from '../powersync-goal-reliable-operation.adapter';

let dbFileCounter = 0;

function createTestSqliteDatabase(filePath?: string): IElectronDatabase {
  const sqlite = new Database(filePath ?? ':memory:');
  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row as T;
    },
    async writeTransaction<T>(
      callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
    ): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper as IElectronDatabaseTransaction);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => sqlite.close(),
  } as IElectronDatabase & { close(): void };
  return wrapper;
}

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS goal_operation_receipts (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  operation_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  occurrence_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

function createReceiptInput(key: string) {
  // occurrenceKey is the trailing segment of the canonical idempotency key:
  // v1:<idLen>:<identityId>:<srcLen>:<source>:<occLen>:<occurrenceKey>
  const parts = key.split(':');
  const occurrenceKey = parts.slice(6).join(':');
  return {
    identityId: 'user-123',
    source: 'goal',
    goalId: 'goal-456',
    occurrenceKey,
    idempotencyKey: key,
  };
}

describe('PowerSyncGoalReliableOperationAdapter (real SQLite)', () => {
  it('persists receipt across a REAL close/reopen of the database file (process restart)', async () => {
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const filePath = join(tmpdir(), `goal-receipt-${Date.now()}-${dbFileCounter++}.sqlite`);

    // First process: write the receipt, then close the connection
    const db1 = createTestSqliteDatabase(filePath);
    await db1.execute(TABLE_SQL);
    const key = 'v1:8:user-123:4:goal:18:completed:goal-456';
    const input = createReceiptInput(key);
    const adapter1 = new PowerSyncGoalReliableOperationAdapter(
      db1 as unknown as IElectronDatabaseTransaction,
    );
    const receipt1 = await adapter1.recordGoalCompletionReceipt(input);
    expect(receipt1.operationId).toBeDefined();
    (db1 as unknown as { close(): void }).close();

    // Second process: reopen the SAME file and rebuild the adapter
    const db2 = createTestSqliteDatabase(filePath);
    await db2.execute(TABLE_SQL);
    const adapter2 = new PowerSyncGoalReliableOperationAdapter(
      db2 as unknown as IElectronDatabaseTransaction,
    );
    const receipt2 = await adapter2.recordGoalCompletionReceipt(input);

    expect(receipt2.operationId).toBe(receipt1.operationId);
    expect(receipt2.createdAt).toBe(receipt1.createdAt);

    const rows = await db2.getAll(
      'SELECT * FROM goal_operation_receipts WHERE idempotency_key = ?',
      [key],
    );
    expect(rows).toHaveLength(1);
    (db2 as unknown as { close(): void }).close();
  });

  it('supports archive symmetric path idempotency', async () => {
    const db = createTestSqliteDatabase();
    await db.execute(TABLE_SQL);

    const key = 'v1:8:user-123:4:goal:25:archived:goal-archive-999';
    const input = createReceiptInput(key);
    const adapter = new PowerSyncGoalReliableOperationAdapter(
      db as unknown as IElectronDatabaseTransaction,
    );

    const receipt1 = await adapter.recordGoalCompletionReceipt(input);
    const receipt2 = await adapter.recordGoalCompletionReceipt(input);

    expect(receipt1.operationId).toBe(receipt2.operationId);
  });

  it('fails closed when the receipt row cannot be persisted (no un-persisted success receipt)', async () => {
    const db = createTestSqliteDatabase();
    const adapter = new PowerSyncGoalReliableOperationAdapter(
      db as unknown as IElectronDatabaseTransaction,
    );
    const input = createReceiptInput('v1:8:user-123:4:goal:18:completed:goal-456');

    await expect(adapter.recordGoalCompletionReceipt(input)).rejects.toThrow();
  });
});

describe('PowerSyncGoalWriteTransactionRunner receipt rollback (W4 P1-1)', () => {
  const LABELS_SQL = `CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
  const GOAL_LABELS_SQL = `CREATE TABLE IF NOT EXISTS goal_labels (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    label_id TEXT NOT NULL
  )`;

  const GOALS_SQL = `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    feasibility_analysis TEXT,
    motivation TEXT,
    status TEXT NOT NULL,
    start_date TEXT,
    due_date TEXT,
    completed_at TEXT,
    archived_at TEXT,
    sort_order INTEGER,
    reminder_config TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`;

  it('rolls back the Goal CAS save when the receipt write fails', async () => {
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { PowerSyncGoalWriteTransactionRunner } =
      await import('../powersync-goal-write-transaction-runner');
    const filePath = join(tmpdir(), `goal-runner-${Date.now()}.sqlite`);
    const db = createTestSqliteDatabase(filePath);
    await db.execute(GOALS_SQL);
    await db.execute(LABELS_SQL);
    await db.execute(GOAL_LABELS_SQL);
    await db.execute(TABLE_SQL);

    const runner = new PowerSyncGoalWriteTransactionRunner(db as never);
    const identityId = 'user-runner';
    const goalId = 'goal-runner-1';

    // Seed the goal row directly (Active, version 1)
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO goals (
         id, identity_id, name, status, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [goalId, identityId, 'Runner Rollback Goal', 'InProgress', 1, now, now],
    );

    // Now make the receipt write fail (RAISE trigger keeps the table but aborts inserts)
    await db.execute(
      `CREATE TRIGGER goal_receipt_fail_insert
       BEFORE INSERT ON goal_operation_receipts
       BEGIN SELECT RAISE(ABORT, 'receipt write failure simulation'); END`,
    );

    const { CompleteGoalUseCase } =
      await import('../../../../application/use-cases/commands/complete-goal.use-case');
    const { GoalPowerSyncRepository } = await import('../goal-powersync.repository');
    const repo = new GoalPowerSyncRepository(db as never);
    const useCase = new CompleteGoalUseCase(
      repo,
      new (await import('../../../../domain')).GoalPolicy(),
      runner,
    );

    // The complete flow must fail: the receipt write aborts the transaction
    await expect(useCase.execute(goalId, identityId, 1)).rejects.toThrow();

    // Goal CAS write rolled back: still version 1, still Active
    const saved = await repo.findByIdForIdentity(identityId, goalId);
    expect(saved?.version).toBe(1);
    expect(saved?.status).toBe('InProgress');
  });
});
