import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asInstant } from '@memoflow/time';
import {
  RoutineDefinition,
  RoutineProfile,
  ProfileMembership,
  ProtocolDefinition,
  ProtocolSession,
  createElapsedTrigger,
  createTemporaryOverride,
  RoutinePreferences,
} from '../../domain/routine';
import { PowerSyncRoutinePreferencesStore } from './routine-preferences-store.powersync';

import { PowerSyncRoutineProfileStore } from './routine-profile-store.powersync';
import { PowerSyncProtocolSessionStore } from './protocol-session-store.powersync';
import { protocolSessionToPowerSync } from './protocol-persistence-parity';
import { PowerSyncRoutineOccurrenceTruthStore } from './routine-occurrence-truth-store.powersync';
import { PowerSyncRoutineTemporaryOverrideStore } from '../routine-schedule/routine-temporary-override-store.powersync';
import {
  ProtocolSessionNotFoundError,
  ProtocolSessionVersionConflictError,
} from '../../domain/ports';

let db: PowerSyncDatabase;
let dbPath: string;
const now = new Date('2026-10-29T00:00:00.000Z');
const tables = [
  'routine_definitions',
  'routine_profiles',
  'routine_profile_memberships',
  'routine_preferences',
  'routine_occurrences',
  'routine_temporary_overrides',
  'routine_protocol_sessions',
  'routine_interactions',
];
beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-routine-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  for (const table of tables) {
    expect(await db.get('SELECT type FROM sqlite_master WHERE name = ?', [table])).toEqual({
      type: 'view',
    });
  }
});
afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

describe('routine writes on real PowerSync views (#709)', () => {
  for (const expectedVersion of [1, 9]) {
    it(`preferences CAS with expected version ${expectedVersion}`, async () => {
      const store = new PowerSyncRoutinePreferencesStore(db);
      const preferences = RoutinePreferences.create({
        identityId: 'identity',
        globalEnabled: true,
        now,
      });
      await store.create({ preferences });
      preferences.setGlobalEnabled(false, new Date(now.getTime() + 1000));
      if (expectedVersion === 1) {
        await expect(store.update({ preferences, expectedVersion })).resolves.toBeUndefined();
        expect((await store.find({ identityId: 'identity' }))?.snapshot()).toEqual(
          preferences.snapshot(),
        );
      } else {
        await expect(store.update({ preferences, expectedVersion })).rejects.toThrow(
          'Routine preferences version conflict',
        );
        expect((await store.find({ identityId: 'identity' }))?.version).toBe(1);
      }
    });
  }
  it('preserves missing preferences conflict', async () => {
    const store = new PowerSyncRoutinePreferencesStore(db);
    const preferences = RoutinePreferences.create({
      identityId: 'missing',
      globalEnabled: true,
      now,
    });
    await expect(store.update({ preferences, expectedVersion: 1 })).rejects.toThrow(
      'Routine preferences version conflict',
    );
    expect(await store.find({ identityId: 'missing' })).toBeNull();
  });
});

const owner = { identityId: 'identity', routineId: 'routine' };
const occurrence = { ...owner, occurrenceKey: 'occurrence' };
const override = () =>
  createTemporaryOverride({
    snoozeUntil: now.getTime() + 1000,
    expiresAt: now.getTime() + 1000,
    reason: 'test',
    source: 'user',
  });
async function seedOccurrence() {
  await db.execute(
    `INSERT INTO routine_occurrences (id, identity_id, routine_id, occurrence_key, trigger_kind, became_due_at, resolution_state) VALUES ('occ', 'identity', 'routine', 'occurrence', 'Elapsed', ?, 'Open')`,
    [now.toISOString()],
  );
}
function session() {
  const protocol = ProtocolDefinition.create({
    id: 'protocol',
    identityId: 'identity',
    name: 'Focus',
    phases: [{ id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 25000 }],
    cyclePolicy: { mode: 'fixed', cycles: 1 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: asInstant(now.getTime()),
  });
  const result = ProtocolSession.create({
    id: 'session',
    identityId: 'identity',
    protocol,
    now: asInstant(now.getTime()),
  });
  result.start(asInstant(now.getTime()));
  return result;
}
async function seedSession() {
  const result = session();
  const row = protocolSessionToPowerSync(result);
  const columns = Object.keys(row);
  await db.execute(
    `INSERT INTO routine_protocol_sessions (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    Object.values(row),
  );
  return result;
}

describe('routine per-site stored-state regression', () => {
  for (const site of [
    'definition update',
    'definition delete',
    'profile update',
    'profile delete',
    'membership update',
    'membership delete',
    'membership replacement',
  ] as const) {
    for (const mode of ['success', 'stale', 'missing', 'foreign'] as const) {
      it(`${site}: ${mode}`, async () => {
        const store = new PowerSyncRoutineProfileStore(db);
        const definition = RoutineDefinition.create({
          id: 'routine',
          identityId: 'identity',
          name: 'Routine',
          trigger: createElapsedTrigger({ durationMs: 60000 }),
          now,
        });
        const profile = RoutineProfile.create({
          id: 'profile',
          identityId: 'identity',
          name: 'Profile',
          enabled: true,
          now,
        });
        const membership = ProfileMembership.create({
          ...owner,
          profileId: 'profile',
          now,
        });
        await store.upsertDefinition(definition);
        await store.upsertProfile(profile);
        // Explicit IDs keep seeding independent of application insert behavior.
        await db.execute(
          `INSERT INTO routine_profile_memberships (id, identity_id, profile_id, routine_id, enabled, version, created_at, updated_at) VALUES ('membership', 'identity', 'profile', 'routine', 1, 1, ?, ?)`,
          [now.toISOString(), now.toISOString()],
        );
        const table = site.startsWith('profile')
          ? 'routine_profiles'
          : site.startsWith('membership') && site !== 'membership replacement'
            ? 'routine_profile_memberships'
            : 'routine_definitions';
        if (mode === 'missing') await db.execute(`DELETE FROM ${table}`);
        if (mode === 'foreign') await db.execute(`UPDATE ${table} SET identity_id = 'foreign'`);
        const before = await db.getAll(`SELECT * FROM ${table}`);
        const expectedVersion = mode === 'stale' ? 9 : 1;
        const nextDefinition = RoutineDefinition.load({
          ...definition.snapshot(),
          name: 'Changed',
          version: 2,
        });
        const nextProfile = RoutineProfile.load({
          ...profile.snapshot(),
          name: 'Changed',
          version: 2,
        });
        const nextMembership = ProfileMembership.load({
          ...membership.snapshot(),
          enabled: false,
          version: 2,
        });
        const call = () => {
          switch (site) {
            case 'definition update':
              return store.updateDefinition({
                definition: nextDefinition,
                expectedVersion,
              });
            case 'definition delete':
              return store.deleteDefinition({ ...owner, expectedVersion });
            case 'profile update':
              return store.updateProfile({
                profile: nextProfile,
                expectedVersion,
              });
            case 'profile delete':
              return store.deleteProfile({
                identityId: 'identity',
                profileId: 'profile',
                expectedVersion,
              });
            case 'membership update':
              return store.upsertMembership(nextMembership, expectedVersion);
            case 'membership delete':
              return store.deleteMembership({
                ...owner,
                profileId: 'profile',
                expectedVersion,
              });
            case 'membership replacement':
              return store.replaceRoutineMemberships({
                ...owner,
                memberships: [],
                expectedVersion,
              });
          }
        };
        if (mode === 'success') {
          await expect(call()).resolves.toBeUndefined();
          const rows = await db.getAll<{ version: number }>(`SELECT * FROM ${table}`);
          if (site.endsWith('delete')) expect(rows).toEqual([]);
          else expect(rows[0].version).toBe(2);
          if (site === 'membership replacement')
            expect(await db.getAll('SELECT * FROM routine_profile_memberships')).toEqual([]);
        } else {
          const message =
            site.startsWith('definition') || site === 'membership replacement'
              ? "Routine 'routine' version conflict"
              : site.startsWith('profile')
                ? "Profile 'profile' version conflict"
                : 'Routine membership version conflict';
          await expect(call()).rejects.toThrow(new Error(message));
          expect(await db.getAll(`SELECT * FROM ${table}`)).toEqual(before);
          if (site === 'membership replacement')
            expect(await db.getAll('SELECT * FROM routine_profile_memberships')).toHaveLength(1);
        }
      });
    }
  }
  it('creates a protocol session and preserves its snapshot', async () => {
    const store = new PowerSyncProtocolSessionStore(db);
    const fresh = session();
    await expect(store.create(fresh)).resolves.toMatchObject({
      persistedVersion: 2,
    });
    expect(
      (await store.findById({ identityId: 'identity', sessionId: 'session' }))?.snapshot(),
    ).toEqual(fresh.snapshot());
  });
  for (const mode of ['success', 'stale', 'missing', 'foreign'] as const) {
    it(`protocol save: ${mode}`, async () => {
      const store = new PowerSyncProtocolSessionStore(db);
      const next = await seedSession();
      if (mode === 'missing') await db.execute('DELETE FROM routine_protocol_sessions');
      if (mode === 'foreign')
        await db.execute("UPDATE routine_protocol_sessions SET identity_id = 'foreign'");
      next.pause(asInstant(now.getTime() + 1000));
      const before = await db.getAll('SELECT * FROM routine_protocol_sessions');
      const result = store.save(next, mode === 'stale' ? 1 : 2);
      if (mode === 'success') {
        await expect(result).resolves.toMatchObject({
          expectedVersion: 2,
          persistedVersion: 3,
        });
        expect(
          (
            await store.findById({
              identityId: 'identity',
              sessionId: 'session',
            })
          )?.snapshot(),
        ).toEqual(next.snapshot());
      } else {
        await expect(result).rejects.toBeInstanceOf(
          mode === 'stale' ? ProtocolSessionVersionConflictError : ProtocolSessionNotFoundError,
        );
        expect(await db.getAll('SELECT * FROM routine_protocol_sessions')).toEqual(before);
      }
    });
  }
  for (const site of ['set', 'clear'] as const) {
    for (const mode of ['success', 'stale', 'missing', 'foreign'] as const) {
      it(`override ${site}: ${mode}`, async () => {
        const store = new PowerSyncRoutineTemporaryOverrideStore(db, () => now);
        await db.execute(
          `INSERT INTO routine_temporary_overrides (id, identity_id, routine_id, override_json, version) VALUES ('override', 'identity', 'routine', '{}', 1)`,
        );
        if (mode === 'missing') await db.execute('DELETE FROM routine_temporary_overrides');
        if (mode === 'foreign')
          await db.execute("UPDATE routine_temporary_overrides SET identity_id = 'foreign'");
        const before = await db.getAll('SELECT * FROM routine_temporary_overrides');
        const input = { ...owner, expectedVersion: mode === 'stale' ? 9 : 1 };
        const result =
          site === 'set'
            ? store.setRoutineTemporaryOverride({
                ...input,
                override: override(),
              })
            : store.clearRoutineTemporaryOverride(input);
        if (mode === 'success') {
          await expect(result).resolves.toBeUndefined();
          if (site === 'clear')
            expect(await db.getAll('SELECT * FROM routine_temporary_overrides')).toEqual([]);
          else
            expect(await db.get('SELECT version FROM routine_temporary_overrides')).toEqual({
              version: 2,
            });
        } else {
          await expect(result).rejects.toThrow(
            new Error("Routine override 'routine' version conflict"),
          );
          expect(await db.getAll('SELECT * FROM routine_temporary_overrides')).toEqual(before);
        }
      });
    }
  }
  it('ensures an open occurrence exactly once', async () => {
    const store = new PowerSyncRoutineOccurrenceTruthStore(db);
    const input = {
      ...occurrence,
      triggerKind: 'Elapsed' as const,
      becameDueAt: now.getTime(),
    };
    const first = await store.ensureOpenOccurrence(input);
    expect(first.resolutionState).toBe('Open');
    expect(await store.ensureOpenOccurrence(input)).toEqual(first);
  });
  for (const mode of ['success', 'terminal', 'missing', 'foreign'] as const) {
    it(`occurrence resolution: ${mode}`, async () => {
      await seedOccurrence();
      const store = new PowerSyncRoutineOccurrenceTruthStore(db);
      if (mode === 'terminal')
        await db.execute(
          "UPDATE routine_occurrences SET resolution_state = 'Skipped', resolution_kind = 'UserSkipped'",
        );
      if (mode === 'missing') await db.execute('DELETE FROM routine_occurrences');
      if (mode === 'foreign')
        await db.execute("UPDATE routine_occurrences SET identity_id = 'foreign'");
      const before = await db.getAll('SELECT * FROM routine_occurrences');
      const input = {
        ...occurrence,
        state: 'Satisfied' as const,
        resolutionKind: 'ExplicitComplete' as const,
        resolvedAt: now.getTime(),
      };
      if (mode === 'success') {
        const result = await store.resolveOccurrence(input);
        expect(result.resolutionState).toBe('Satisfied');
        expect(await store.resolveOccurrence(input)).toEqual(result);
      } else {
        await expect(store.resolveOccurrence(input)).rejects.toThrow(
          new Error(
            mode === 'terminal'
              ? "Routine occurrence 'occurrence' is already resolved as Skipped"
              : "Routine occurrence 'occurrence' was not found for owner 'routine'",
          ),
        );
        expect(await db.getAll('SELECT * FROM routine_occurrences')).toEqual(before);
      }
    });
  }
  for (const existing of [false, true]) {
    it(`snooze interaction with existing override=${existing}`, async () => {
      await seedOccurrence();
      if (existing)
        await db.execute(
          `INSERT INTO routine_temporary_overrides (id, identity_id, routine_id, override_json, version) VALUES ('override', 'identity', 'routine', '{}', 1)`,
        );
      const store = new PowerSyncRoutineOccurrenceTruthStore(db);
      const input = {
        ...occurrence,
        idempotencyKey: 'snooze',
        action: 'Snoozed' as const,
        actedAt: now.getTime(),
        snoozeDurationMs: 1000,
        temporaryOverride: override(),
      };
      const result = await store.applyInteraction(input);
      expect(result.replayed).toBe(false);
      expect(await db.get('SELECT version FROM routine_temporary_overrides')).toEqual({
        version: existing ? 2 : 1,
      });
      expect((await store.applyInteraction(input)).replayed).toBe(true);
      await expect(
        store.applyInteraction({
          ...input,
          snoozeDurationMs: 2000,
          temporaryOverride: createTemporaryOverride({
            snoozeUntil: now.getTime() + 2000,
            expiresAt: now.getTime() + 2000,
            reason: 'test',
            source: 'user',
          }),
        }),
      ).rejects.toThrow(
        "Routine interaction idempotency key 'snooze' was reused for a different command",
      );
      expect(await db.getAll('SELECT * FROM routine_interactions')).toHaveLength(1);
    });
  }
  it('rejects a missing interaction occurrence without partial override or interaction', async () => {
    const store = new PowerSyncRoutineOccurrenceTruthStore(db);
    await expect(
      store.applyInteraction({
        ...occurrence,
        idempotencyKey: 'missing',
        action: 'Snoozed',
        actedAt: now.getTime(),
        snoozeDurationMs: 1000,
        temporaryOverride: override(),
      }),
    ).rejects.toThrow("Routine occurrence 'occurrence' was not found for owner 'routine'");
    expect(await db.getAll('SELECT * FROM routine_interactions')).toEqual([]);
    expect(await db.getAll('SELECT * FROM routine_temporary_overrides')).toEqual([]);
  });
});

// Exercise adapters that return a query-only tx and those that pass themselves.
for (const context of ['database', 'transaction', 'self-context'] as const) {
  it(`all public mutation methods use one transaction body: ${context}`, async () => {
    const exercise = async (
      connection: import('@memoflow/desktop-contracts').IElectronDatabaseTransaction,
    ) => {
      const profiles = new PowerSyncRoutineProfileStore(connection);
      const definition = RoutineDefinition.create({
        id: 'routine',
        identityId: 'identity',
        name: 'Routine',
        trigger: createElapsedTrigger({ durationMs: 60000 }),
        now,
      });
      const profile = RoutineProfile.create({
        id: 'profile',
        identityId: 'identity',
        name: 'Profile',
        enabled: true,
        now,
      });
      const membership = ProfileMembership.create({ ...owner, profileId: 'profile', now });
      await profiles.upsertProfile(profile);
      await profiles.upsertProfile(profile);
      await profiles.createDefinitionWithMemberships({ definition, memberships: [membership] });
      await profiles.upsertDefinition(definition);
      await profiles.upsertMembership(membership);
      await profiles.updateDefinition({
        definition: RoutineDefinition.load({ ...definition.snapshot(), version: 2 }),
        expectedVersion: 1,
      });
      await profiles.updateProfile({
        profile: RoutineProfile.load({ ...profile.snapshot(), version: 2 }),
        expectedVersion: 1,
      });
      await profiles.upsertMembership(
        ProfileMembership.load({ ...membership.snapshot(), version: 2 }),
        1,
      );
      await profiles.deleteMembership({ ...owner, profileId: 'profile', expectedVersion: 2 });
      await profiles.replaceRoutineMemberships({
        ...owner,
        memberships: [membership],
        expectedVersion: 2,
      });
      await profiles.deleteMembership({ ...owner, profileId: 'profile' });
      await profiles.deleteProfile({
        identityId: 'identity',
        profileId: 'profile',
        expectedVersion: 2,
      });
      await profiles.deleteDefinition({ ...owner, expectedVersion: 3 });
      const preferences = RoutinePreferences.create({
        identityId: 'identity',
        globalEnabled: true,
        now,
      });
      const prefs = new PowerSyncRoutinePreferencesStore(connection);
      await prefs.create({ preferences });
      preferences.setGlobalEnabled(false, new Date(now.getTime() + 1000));
      await prefs.update({ preferences, expectedVersion: 1 });
      const sessions = new PowerSyncProtocolSessionStore(connection);
      const current = session();
      await sessions.create(current);
      current.pause(asInstant(now.getTime() + 1000));
      await sessions.save(current, 2);
      const overrides = new PowerSyncRoutineTemporaryOverrideStore(connection, () => now);
      await overrides.setRoutineTemporaryOverride({ ...owner, override: override() });
      await overrides.setRoutineTemporaryOverride({
        ...owner,
        override: override(),
        expectedVersion: 1,
      });
      await overrides.clearRoutineTemporaryOverride({ ...owner, expectedVersion: 2 });
      await overrides.clearRoutineTemporaryOverride(owner);
      const truth = new PowerSyncRoutineOccurrenceTruthStore(connection);
      await truth.ensureOpenOccurrence({
        ...occurrence,
        triggerKind: 'Elapsed',
        becameDueAt: now.getTime(),
      });
      await truth.resolveOccurrence({
        ...occurrence,
        state: 'Satisfied',
        resolutionKind: 'ExplicitComplete',
        resolvedAt: now.getTime(),
      });
      expect(
        (
          await truth.applyInteraction({
            ...occurrence,
            idempotencyKey: 'completed',
            action: 'Completed',
            actedAt: now.getTime(),
          })
        ).replayed,
      ).toBe(false);
      expect(
        (
          await truth.applyInteraction({
            ...occurrence,
            idempotencyKey: 'completed',
            action: 'Completed',
            actedAt: now.getTime(),
          })
        ).replayed,
      ).toBe(true);
    };
    if (context === 'database') await exercise(db);
    else if (context === 'transaction') await db.writeTransaction(exercise);
    else {
      type Tx = import('@memoflow/desktop-contracts').IElectronDatabaseTransaction;
      type Db = import('@memoflow/desktop-contracts').IElectronDatabase;
      const queryable = (tx: Tx): Tx => ({
        execute: tx.execute.bind(tx),
        get: tx.get.bind(tx),
        getAll: tx.getAll.bind(tx),
        getOptional: tx.getOptional.bind(tx),
      });
      const adapter: Db = {
        ...queryable(db),
        writeTransaction: (body) =>
          db.writeTransaction((tx) =>
            body({
              ...queryable(tx),
              writeTransaction: () => {
                throw new Error('cannot start a transaction within a transaction');
              },
            } as Db),
          ),
      };
      await exercise(adapter);
    }
    expect(await db.get('SELECT version FROM routine_protocol_sessions')).toEqual({ version: 3 });
    expect(await db.get('SELECT version FROM routine_preferences')).toEqual({ version: 2 });
  });
}

it('proves all eight generated views persist writes while reporting zero rows', async () => {
  const timestamp = new Date(now.getTime() + 1000).toISOString();
  for (const table of tables) {
    await db.execute(`INSERT INTO ${table} (id, identity_id) VALUES ('proof', ?)`, [
      now.toISOString(),
    ]);
    const result = await db.execute(`UPDATE ${table} SET identity_id = ? WHERE id = 'proof'`, [
      timestamp,
    ]);
    expect(result.rowsAffected).toBe(0);
    expect(await db.get(`SELECT identity_id FROM ${table} WHERE id = 'proof'`)).toEqual({
      identity_id: timestamp,
    });
  }
});

it('preserves an existing occurrence trigger mismatch without mutation', async () => {
  await seedOccurrence();
  const before = await db.getAll('SELECT * FROM routine_occurrences');
  const store = new PowerSyncRoutineOccurrenceTruthStore(db);
  await expect(
    store.ensureOpenOccurrence({
      ...occurrence,
      triggerKind: 'ActiveUsage',
      becameDueAt: now.getTime(),
    }),
  ).rejects.toThrow(
    new Error("Routine occurrence 'occurrence' trigger mismatch: Elapsed != ActiveUsage"),
  );
  expect(await db.getAll('SELECT * FROM routine_occurrences')).toEqual(before);
});
