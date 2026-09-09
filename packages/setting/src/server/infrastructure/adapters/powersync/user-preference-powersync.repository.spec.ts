import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { UserPreferenceDocument } from '../../../preferences';
import {
  PowerSyncUserPreferenceMapper,
  type PowerSyncUserPreferenceRow,
} from './powersync-user-preference.mapper';
import { UserPreferencePowerSyncRepository } from './user-preference-powersync.repository';

function row(overrides: Partial<PowerSyncUserPreferenceRow> = {}): PowerSyncUserPreferenceRow {
  return {
    id: 'pref-1',
    identity_id: 'identity-1',
    namespace: 'regional',
    payload: JSON.stringify({
      timeZone: 'Asia/Tokyo',
      dateStyle: 'medium',
      timeStyle: '24h',
      weekStartsOn: 1,
    }),
    revision: 1,
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function document(revision = 1): UserPreferenceDocument {
  return UserPreferenceDocument.load({
    id: 'pref-1',
    identityId: 'identity-1',
    namespace: 'regional',
    payload: {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'medium',
      timeStyle: '24h',
      weekStartsOn: 1,
    },
    revision,
    createdAt: Date.parse('2026-09-09T00:00:00.000Z'),
    updatedAt: Date.parse(`2026-09-09T00:00:0${Math.min(revision, 9)}.000Z`),
  });
}

class FakeDb implements IElectronDatabaseTransaction {
  rows = new Map<string, PowerSyncUserPreferenceRow>();
  updateRowsAffected: number | null = null;
  insertError: unknown = null;
  executeCalls: Array<{ sql: string; parameters?: unknown[] }> = [];

  private key(identityId: string, namespace: string): string {
    return `${identityId}:${namespace}`;
  }

  async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
    this.executeCalls.push({ sql, parameters });
    if (sql.includes('INSERT INTO user_preference_records')) {
      if (this.insertError) throw this.insertError;
      const [id, identityId, namespace, payload, revision, createdAt, updatedAt] = parameters ?? [];
      this.rows.set(this.key(String(identityId), String(namespace)), {
        id: String(id),
        identity_id: String(identityId),
        namespace: String(namespace),
        payload: String(payload),
        revision: Number(revision),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      });
      return { rowsAffected: 1 };
    }
    if (sql.includes('UPDATE user_preference_records')) {
      const affected = this.updateRowsAffected ?? 1;
      if (affected === 1) {
        const [payload, revision, updatedAt, identityId, namespace] = parameters ?? [];
        const key = this.key(String(identityId), String(namespace));
        const current = this.rows.get(key);
        if (current) {
          this.rows.set(key, {
            ...current,
            payload: String(payload),
            revision: Number(revision),
            updated_at: String(updatedAt),
          });
        }
      }
      return { rowsAffected: affected };
    }
    return { rowsAffected: 0 };
  }

  async getAll<T>(_sql: string, parameters?: unknown[]): Promise<T[]> {
    const identityId = String(parameters?.[0]);
    return [...this.rows.values()].filter((value) => value.identity_id === identityId) as T[];
  }

  async getOptional<T>(_sql: string, parameters?: unknown[]): Promise<T | null> {
    const [identityId, namespace] = parameters ?? [];
    return (
      (this.rows.get(this.key(String(identityId), String(namespace))) as T | undefined) ?? null
    );
  }

  async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
    const value = await this.getOptional<T>(sql, parameters);
    if (value == null) throw new Error('row not found');
    return value;
  }
}

describe('PowerSyncUserPreferenceMapper', () => {
  it('round-trips a strict canonical namespace row', () => {
    const domain = PowerSyncUserPreferenceMapper.toDomain(row());
    expect(domain.toResponse()).toMatchObject({
      namespace: 'regional',
      revision: 1,
      preferences: { timeZone: 'Asia/Tokyo' },
    });
    expect(PowerSyncUserPreferenceMapper.toPersistence(domain)).toMatchObject({
      identityId: 'identity-1',
      namespace: 'regional',
      revision: 1,
    });
  });

  it('rejects unknown namespaces and unknown persisted payload keys', () => {
    expect(() => PowerSyncUserPreferenceMapper.toDomain(row({ namespace: 'other' }))).toThrow();
    expect(() =>
      PowerSyncUserPreferenceMapper.toDomain(
        row({
          payload: JSON.stringify({
            timeZone: 'UTC',
            dateStyle: 'medium',
            timeStyle: '24h',
            weekStartsOn: 1,
            typo: true,
          }),
        }),
      ),
    ).toThrow();
  });
});

describe('UserPreferencePowerSyncRepository', () => {
  it('uses revision in the SQLite CAS predicate', async () => {
    const db = new FakeDb();
    db.rows.set('identity-1:regional', row());
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.compareAndSwap(document(2), 1)).resolves.toMatchObject({
      kind: 'updated',
      document: { revision: 2 },
    });
    const update = db.executeCalls.find((call) =>
      call.sql.includes('UPDATE user_preference_records'),
    );
    expect(update?.sql).toContain('WHERE identity_id = ? AND namespace = ? AND revision = ?');
    expect(update?.parameters?.at(-1)).toBe(1);
  });

  it('re-reads the latest row when rowsAffected is zero', async () => {
    const db = new FakeDb();
    db.rows.set('identity-1:regional', row({ revision: 3 }));
    db.updateRowsAffected = 0;
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.compareAndSwap(document(2), 1)).resolves.toMatchObject({
      kind: 'conflict',
      latest: { revision: 3 },
    });
  });

  it('recovers an insert race only when the canonical winner can be re-read', async () => {
    const db = new FakeDb();
    db.rows.set('identity-1:regional', row({ id: 'winner' }));
    db.insertError = new Error('UNIQUE constraint failed');
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.create(document())).resolves.toMatchObject({
      kind: 'exists',
      document: { id: 'winner', revision: 1 },
    });
  });

  it('rejects creation at any revision other than 1', async () => {
    const db = new FakeDb();
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.create(document(2))).rejects.toThrow(/start at revision 1/);
    expect(db.executeCalls).toHaveLength(0);
  });

  it('rejects a CAS document that does not advance exactly one revision', async () => {
    const db = new FakeDb();
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.compareAndSwap(document(3), 1)).rejects.toThrow(/advance exactly one/);
    expect(db.executeCalls).toHaveLength(0);
  });

  it('rethrows an insert failure when no unique winner exists', async () => {
    const db = new FakeDb();
    const failure = new Error('disk I/O error');
    db.insertError = failure;
    const repository = new UserPreferencePowerSyncRepository(db);
    await expect(repository.create(document())).rejects.toBe(failure);
  });
});
