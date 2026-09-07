import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import {
  createElapsedTrigger,
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
} from '../../domain/routine';
import { PowerSyncRoutineProfileStore } from './routine-profile-store.powersync';

function createDb(): IElectronDatabase & { close(): void } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE routine_definitions (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL,
      trigger_json TEXT,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX routine_definitions_owner ON routine_definitions(identity_id, id);
    CREATE TABLE routine_profiles (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL,
      active INTEGER NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX routine_profiles_owner ON routine_profiles(identity_id, id);
    CREATE TABLE routine_profile_memberships (
      identity_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      routine_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (identity_id, profile_id, routine_id),
      FOREIGN KEY (profile_id) REFERENCES routine_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (routine_id) REFERENCES routine_definitions(id) ON DELETE CASCADE
    );
  `);

  const db: IElectronDatabase = {
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
        const result = await callback(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return Object.assign(db, { close: () => sqlite.close() });
}

function fixture() {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const routine = RoutineDefinition.create({
    id: 'drink-water',
    identityId: 'identity-1',
    name: 'Drink Water',
    trigger: createElapsedTrigger({ durationMs: 60 * 60_000 }),
    now,
  });
  const work = RoutineProfile.create({
    id: 'work',
    identityId: 'identity-1',
    name: 'Work',
    enabled: true,
    active: true,
    now,
  });
  const gaming = RoutineProfile.create({
    id: 'gaming',
    identityId: 'identity-1',
    name: 'Gaming',
    enabled: true,
    active: false,
    now,
  });
  return { routine, work, gaming, now };
}

describe('PowerSyncRoutineProfileStore', () => {
  it('persists one Routine across multiple Profiles and atomically replaces its edge set', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncRoutineProfileStore(db);
      const { routine, work, gaming, now } = fixture();
      await store.upsertDefinition(routine);
      await store.upsertProfile(work);
      await store.upsertProfile(gaming);

      const workMembership = ProfileMembership.create({
        identityId: routine.identityId,
        profileId: work.id,
        routineId: routine.id,
        enabled: true,
        now,
      });
      const gamingMembership = ProfileMembership.create({
        identityId: routine.identityId,
        profileId: gaming.id,
        routineId: routine.id,
        enabled: false,
        now,
      });
      await store.replaceRoutineMemberships({
        identityId: routine.identityId,
        routineId: routine.id,
        memberships: [workMembership, gamingMembership],
      });

      expect(
        (await store.findDefinition({ identityId: routine.identityId, routineId: routine.id }))
          ?.name,
      ).toBe('Drink Water');
      expect(
        (await store.listProfiles({ identityId: routine.identityId })).map((profile) => profile.id),
      ).toEqual(['gaming', 'work']);
      expect(
        (
          await store.findProfilesByIds({
            identityId: routine.identityId,
            profileIds: [work.id, 'missing', gaming.id],
          })
        ).map((profile) => profile.id),
      ).toEqual(['gaming', 'work']);
      expect(
        (
          await store.listMembershipsForRoutine({
            identityId: routine.identityId,
            routineId: routine.id,
          })
        ).map((membership) => [membership.profileId, membership.enabled]),
      ).toEqual([
        ['gaming', false],
        ['work', true],
      ]);
      expect(
        (
          await store.listMembershipsForRoutines({
            identityId: routine.identityId,
            routineIds: [routine.id, 'missing-routine'],
          })
        ).map((membership) => [membership.routineId, membership.profileId]),
      ).toEqual([
        [routine.id, 'gaming'],
        [routine.id, 'work'],
      ]);

      await store.replaceRoutineMemberships({
        identityId: routine.identityId,
        routineId: routine.id,
        memberships: [workMembership],
      });
      expect(
        (
          await store.listMembershipsForRoutine({
            identityId: routine.identityId,
            routineId: routine.id,
          })
        ).map((membership) => membership.profileId),
      ).toEqual(['work']);
    } finally {
      db.close();
    }
  });

  it('rejects invalid replacement sets before changing durable membership state', async () => {
    const db = createDb();
    try {
      const store = new PowerSyncRoutineProfileStore(db);
      const { routine, work, now } = fixture();
      await store.upsertDefinition(routine);
      await store.upsertProfile(work);
      const membership = ProfileMembership.create({
        identityId: routine.identityId,
        profileId: work.id,
        routineId: routine.id,
        now,
      });

      await expect(
        store.replaceRoutineMemberships({
          identityId: routine.identityId,
          routineId: routine.id,
          memberships: [membership, membership],
        }),
      ).rejects.toThrow(/Duplicate Routine profile membership/);
      await expect(
        store.replaceRoutineMemberships({
          identityId: 'identity-other',
          routineId: routine.id,
          memberships: [membership],
        }),
      ).rejects.toThrow(/ownership mismatch/);
      expect(
        await store.listMembershipsForRoutine({
          identityId: routine.identityId,
          routineId: routine.id,
        }),
      ).toEqual([]);
    } finally {
      db.close();
    }
  });
});
