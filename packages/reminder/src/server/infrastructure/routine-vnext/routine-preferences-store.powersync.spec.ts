import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { RoutinePreferences } from '../../domain/routine';
import { PowerSyncRoutinePreferencesStore } from './routine-preferences-store.powersync';

class FakeDb implements IElectronDatabase {
  readonly calls: Array<{ sql: string; parameters?: unknown[] }> = [];

  constructor(
    private row: Record<string, unknown> | null,
    private readonly updateRowsAffected = 1,
  ) {}

  async getAll<T>(): Promise<T[]> {
    return [];
  }

  async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
    this.calls.push({ sql, parameters });
    return this.row as T | null;
  }

  async get<T>(): Promise<T> {
    throw new Error('not used');
  }

  async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
    this.calls.push({ sql, parameters });
    if (sql.includes('INSERT INTO routine_preferences')) {
      this.row = {
        id: parameters?.[0],
        identity_id: parameters?.[1],
        global_enabled: parameters?.[2],
        version: parameters?.[3],
        created_at: parameters?.[4],
        updated_at: parameters?.[5],
      };
      return { rowsAffected: 1 };
    }
    if (sql.includes('UPDATE routine_preferences')) {
      return { rowsAffected: this.updateRowsAffected };
    }
    throw new Error('Unexpected SQL: ' + sql);
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }
}

describe('PowerSyncRoutinePreferencesStore', () => {
  it('maps integer booleans and persists create/update state', async () => {
    const db = new FakeDb({
      id: 'routine-preferences:identity-1',
      identity_id: 'identity-1',
      global_enabled: 0,
      version: 3,
      created_at: '2026-09-28T00:00:00.000Z',
      updated_at: '2026-09-28T00:02:00.000Z',
    });
    const store = new PowerSyncRoutinePreferencesStore(db);

    const loaded = await store.find({ identityId: 'identity-1' });
    expect(loaded?.globalEnabled).toBe(false);
    expect(loaded?.version).toBe(3);

    const preferences = RoutinePreferences.create({
      identityId: 'identity-2',
      globalEnabled: true,
      now: new Date('2026-09-28T00:00:00.000Z'),
    });
    await store.create({ preferences });
    expect(db.calls.at(-1)?.parameters?.[2]).toBe(1);

    preferences.setGlobalEnabled(false, new Date('2026-09-28T00:01:00.000Z'));
    await store.update({ preferences, expectedVersion: 1 });
    const update = db.calls.at(-1);
    expect(update?.sql).toContain('WHERE identity_id = ? AND version = ?');
    expect(update?.parameters).toEqual([0, 2, '2026-09-28T00:01:00.000Z', 'identity-2', 1]);
  });

  it('rejects PowerSync optimistic concurrency conflicts', async () => {
    const db = new FakeDb(null, 0);
    const store = new PowerSyncRoutinePreferencesStore(db);
    const preferences = RoutinePreferences.create({
      identityId: 'identity-1',
      globalEnabled: true,
      now: new Date('2026-09-28T00:00:00.000Z'),
    });
    preferences.setGlobalEnabled(false, new Date('2026-09-28T00:01:00.000Z'));

    await expect(store.update({ preferences, expectedVersion: 1 })).rejects.toThrow(
      'Routine preferences version conflict',
    );
  });
});
