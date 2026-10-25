import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { AiGoalSurfaceLeasePowerSyncRepository } from './ai-goal-surface-lease.powersync';

const databases: DatabaseSync[] = [];

function memoryDb(): IElectronDatabase {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  const query: IElectronDatabaseTransaction = {
    async execute(command, parameters = []) {
      const result = sql.prepare(command).run(...(parameters as SQLInputValue[]));
      return { rowsAffected: result.changes };
    },
    async getOptional<T>(command: string, parameters: unknown[] = []) {
      return (
        (sql.prepare(command).get(...(parameters as SQLInputValue[])) as T | undefined) ?? null
      );
    },
    async getAll<T>(command: string, parameters: unknown[] = []) {
      return sql.prepare(command).all(...(parameters as SQLInputValue[])) as T[];
    },
    async get<T>(command: string, parameters: unknown[] = []) {
      const value = sql.prepare(command).get(...(parameters as SQLInputValue[]));
      if (!value) throw new Error('Not found');
      return value as T;
    },
  };
  let tail: Promise<void> = Promise.resolve();
  return {
    ...query,
    async writeTransaction<T>(
      callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
    ): Promise<T> {
      let unlock!: () => void;
      const next = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const previous = tail;
      tail = next;
      await previous;
      try {
        sql.exec('BEGIN IMMEDIATE');
        const result = await callback(query);
        sql.exec('COMMIT');
        return result;
      } catch (cause) {
        sql.exec('ROLLBACK');
        throw cause;
      } finally {
        unlock();
      }
    },
  };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe('Profile-local Goal surface lease: real SQLite transactional fencing', () => {
  const a = {
    identityId: 'identity-one',
    runId: 'goal-run',
    token: 'token-A',
    now: 1_000,
    expiresAt: 31_000,
  };
  it('allows one concurrent claimant and no second window with the same owner identity', async () => {
    const db = memoryDb();
    const first = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const second = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const [one, two] = await Promise.all([
      first.claim(a),
      second.claim({ ...a, token: 'token-B' }),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(one?.fence ?? two?.fence).toBe(1);
  });

  it('fences an expired generation, preserves monotone revisions on release and guards owner', async () => {
    const db = memoryDb();
    const first = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const second = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const claim1 = await first.claim(a);
    expect(claim1).toMatchObject({ token: 'token-A', fence: 1 });
    expect(await second.claim({ ...a, token: 'token-B', now: 2000 })).toBeNull();
    const claim2 = await second.claim({ ...a, token: 'token-B', now: 32_000, expiresAt: 62_000 });
    expect(claim2).toMatchObject({ token: 'token-B', fence: 2 });
    expect(await first.renew({ ...a, now: 32_001, expiresAt: 63_000, fence: 1 })).toBe(false);
    expect(await first.release({ ...a, now: 32_001, fence: 1 })).toBe(false);
    expect(
      await second.renew({ ...a, token: 'token-B', now: 32_001, expiresAt: 62_500, fence: 2 }),
    ).toBe(true);
    expect(
      await second.release({
        identityId: 'identity-other',
        runId: a.runId,
        token: 'token-B',
        now: 32_001,
        fence: 2,
      }),
    ).toBe(false);
    expect(
      await second.release({
        identityId: a.identityId,
        runId: a.runId,
        token: 'token-B',
        now: 32_001,
        fence: 2,
      }),
    ).toBe(true);
    const claim3 = await first.claim({ ...a, token: 'token-C', now: 32_002, expiresAt: 63_000 });
    expect(claim3?.fence).toBe(3);
  });

  it('isolates same run IDs across accounts and maintains monotone generations', async () => {
    const db = memoryDb();
    const repo = new AiGoalSurfaceLeasePowerSyncRepository(db);
    const one = await repo.claim(a);
    const other = await repo.claim({ ...a, identityId: 'identity-two', token: 'other' });
    expect(one?.fence).toBe(1);
    expect(other?.fence).toBe(1);
    expect(await repo.renew({ ...a, identityId: 'identity-two', fence: 1 })).toBe(false);
  });
});
