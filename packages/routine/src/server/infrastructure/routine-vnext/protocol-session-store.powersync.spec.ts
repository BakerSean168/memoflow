import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { asInstant } from '@memoflow/time';
import { ProtocolDefinition, ProtocolSession } from '../../domain/routine';
import { ProtocolSessionVersionConflictError } from '../../domain/ports';
import { PowerSyncProtocolSessionStore } from './protocol-session-store.powersync';

function createDb(): IElectronDatabase & { close(): void } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE routine_protocol_sessions (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      protocol_id TEXT NOT NULL,
      protocol_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      termination_reason TEXT,
      ended_at TEXT,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
  return Object.assign(wrapper, { close: () => sqlite.close() });
}

function runningSession(): ProtocolSession {
  const protocol = ProtocolDefinition.create({
    id: 'p-1',
    identityId: 'identity-1',
    name: '25/5',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 25_000 },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 5_000 },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 1 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: asInstant(1_000),
  });
  const session = ProtocolSession.create({
    id: 's-1',
    identityId: 'identity-1',
    protocol,
    now: asInstant(1_000),
  });
  session.start(asInstant(1_000));
  return session;
}

describe('PowerSyncProtocolSessionStore', () => {
  it('round-trips recoverable snapshots and fences stale writes by version', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncProtocolSessionStore(db);
      const session = runningSession();
      await store.create(session);

      const stale = await store.findById({ identityId: 'identity-1', sessionId: 's-1' });
      const current = await store.findById({ identityId: 'identity-1', sessionId: 's-1' });
      expect(stale?.snapshot()).toEqual(session.snapshot());
      expect(await store.listRecoverable({ identityId: 'identity-1' })).toHaveLength(1);

      current!.pause(asInstant(10_000));
      await expect(store.save(current!, 2)).resolves.toMatchObject({ persistedVersion: 3 });

      stale!.end(asInstant(11_000));
      await expect(store.save(stale!, 2)).rejects.toBeInstanceOf(
        ProtocolSessionVersionConflictError,
      );

      const restored = await store.findById({ identityId: 'identity-1', sessionId: 's-1' });
      expect(restored?.snapshot()).toMatchObject({ state: 'Paused', version: 3 });
    } finally {
      db.close();
    }
  });

  it('removes terminal sessions from recoverable enumeration after CAS save', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncProtocolSessionStore(db);
      const session = runningSession();
      await store.create(session);
      session.cancel(asInstant(2_000));
      await store.save(session, 2);

      expect(await store.listRecoverable({ identityId: 'identity-1' })).toEqual([]);
    } finally {
      db.close();
    }
  });
});
