import { describe, expect, it } from 'vitest';
import type { CrudOperation } from './crud-executor.js';
import { executeCrudBatch } from './crud-executor.js';
import {
  PowerSyncRowVersionConflictError,
  executeRowVersionGuardedCrudOperation,
} from './row-version-guard.js';

const IDENTITY = 'owner-identity';

interface Row extends Record<string, unknown> {
  id: string;
  identityId: string;
  version?: number;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected !== null && typeof expected === 'object' && 'lt' in expected) {
      return typeof row[key] === 'number' && (row[key] as number) < (expected as { lt: number }).lt;
    }
    return row[key] === expected;
  });
}

/**
 * Minimal in-memory Prisma stand-in with the compare-and-swap semantics the
 * guard depends on. Generic write entry points throw so the test proves the
 * last-write-wins path is never reached for guarded tables.
 */
function createStore(initial: Row[]) {
  const rows = new Map<string, Row>(initial.map((row) => [row.id, { ...row }]));
  const delegate = {
    async createMany(args: { data: Record<string, unknown>; skipDuplicates: true }) {
      const id = String(args.data.id);
      if (rows.has(id)) return { count: 0 };
      rows.set(id, { ...(args.data as Row) });
      return { count: 1 };
    },
    async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      let count = 0;
      for (const row of rows.values()) {
        if (!matches(row, args.where)) continue;
        Object.assign(row, args.data);
        count += 1;
      }
      return { count };
    },
    async findFirst(args: { where: Record<string, unknown> }) {
      for (const row of rows.values()) if (matches(row, args.where)) return { ...row };
      return null;
    },
    async upsert(): Promise<never> {
      throw new Error('generic upsert must not run for version-guarded tables');
    },
    async update(): Promise<never> {
      throw new Error('generic update must not run for version-guarded tables');
    },
    async deleteMany(): Promise<never> {
      throw new Error('generic deleteMany must not run for version-guarded tables');
    },
  };
  return { rows, delegate };
}

function createDatabase(goals: Row[], taskPlans: Row[] = []) {
  const goal = createStore(goals);
  const taskPlan = createStore(taskPlans);
  const tx = { goal: goal.delegate, taskPlan: taskPlan.delegate };
  const db = {
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
  };
  return { db, goal, taskPlan };
}

const patch = (data: Record<string, unknown>, id = 'goal-1'): CrudOperation => ({
  op: 'PATCH',
  type: 'goals',
  id,
  data,
});

const put = (data: Record<string, unknown>, id = 'goal-1'): CrudOperation => ({
  op: 'PUT',
  type: 'goals',
  id,
  data,
});

describe('row version guard', () => {
  it('applies an upload that advances the stored revision', async () => {
    const { db, goal } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Base', version: 1 },
    ]);
    await executeCrudBatch(db as never, IDENTITY, [
      { ops: [patch({ name: 'Local edit', version: 2 })] },
    ]);
    expect(goal.rows.get('goal-1')).toMatchObject({
      name: 'Local edit',
      version: 2,
      identityId: IDENTITY,
    });
  });

  it('rejects a stale upload without touching the winning row', async () => {
    const { db, goal } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Cloud edit', version: 2 },
    ]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ name: 'Offline edit', version: 2 })] }]),
    ).rejects.toMatchObject({
      code: 'row_version_conflict',
      table: 'goals',
      rowId: 'goal-1',
      operation: 'PATCH',
      incomingVersion: 2,
      currentVersion: 2,
      reason: 'stale_version',
    });
    expect(goal.rows.get('goal-1')).toMatchObject({ name: 'Cloud edit', version: 2 });
  });

  it('reports the stored revision when the server is further ahead', async () => {
    const { db } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Cloud edit', version: 4 },
    ]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ name: 'Offline edit', version: 2 })] }]),
    ).rejects.toMatchObject({ currentVersion: 4, reason: 'stale_version' });
  });

  it('accepts a replayed upload whose columns are already stored', async () => {
    const { db, goal } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Local edit', version: 2 },
    ]);
    await executeCrudBatch(db as never, IDENTITY, [
      { ops: [patch({ name: 'Local edit', version: 2 })] },
    ]);
    expect(goal.rows.get('goal-1')).toMatchObject({ name: 'Local edit', version: 2 });
  });

  it('keeps unversioned auxiliary column writes single-column', async () => {
    const { db, goal } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Base', status: 'Active', version: 2 },
    ]);
    await executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ status: 'Completed' })] }]);
    expect(goal.rows.get('goal-1')).toMatchObject({
      status: 'Completed',
      name: 'Base',
      version: 2,
    });
  });

  it('rejects a patch for a row the server no longer has', async () => {
    const { db } = createDatabase([]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ name: 'Local edit', version: 2 })] }]),
    ).rejects.toMatchObject({ reason: 'row_missing', currentVersion: null });
  });

  it('creates once and rejects a create that would overwrite an existing row', async () => {
    const { db, goal } = createDatabase([]);
    await executeCrudBatch(db as never, IDENTITY, [
      { ops: [put({ name: 'Created locally', version: 1 })] },
    ]);
    expect(goal.rows.get('goal-1')).toMatchObject({ name: 'Created locally', version: 1 });

    await expect(
      executeCrudBatch(db as never, IDENTITY, [
        { ops: [put({ name: 'Different content', version: 1 })] },
      ]),
    ).rejects.toBeInstanceOf(PowerSyncRowVersionConflictError);
    expect(goal.rows.get('goal-1')).toMatchObject({ name: 'Created locally', version: 1 });
  });

  it('requires a version on task plan creates', async () => {
    const { db } = createDatabase([]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [
        { ops: [{ op: 'PUT', type: 'task_plans', id: 'plan-1', data: { name: 'Plan' } }] },
      ]),
    ).rejects.toThrow(/Invalid task_plans row version/);
  });

  it('rejects an invalid version value instead of writing it', async () => {
    const { db } = createDatabase([
      { id: 'goal-1', identityId: IDENTITY, name: 'Base', version: 1 },
    ]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ name: 'Local edit', version: '2' })] }]),
    ).rejects.toThrow(/Invalid goals row version/);
  });

  it('rejects hard deletes on guarded tables instead of bypassing the guard', async () => {
    await expect(
      executeRowVersionGuardedCrudOperation({ goal: createStore([]).delegate }, IDENTITY, {
        op: 'DELETE',
        type: 'goals',
        id: 'goal-1',
      }),
    ).rejects.toThrow(/Unsupported DELETE/);
  });

  it('scopes the compare-and-swap to the uploading identity', async () => {
    const { db, goal } = createDatabase([
      { id: 'goal-1', identityId: 'other-identity', name: 'Foreign', version: 1 },
    ]);
    await expect(
      executeCrudBatch(db as never, IDENTITY, [{ ops: [patch({ name: 'Local edit', version: 2 })] }]),
    ).rejects.toMatchObject({ reason: 'row_missing' });
    expect(goal.rows.get('goal-1')).toMatchObject({ name: 'Foreign', version: 1 });
  });
});
