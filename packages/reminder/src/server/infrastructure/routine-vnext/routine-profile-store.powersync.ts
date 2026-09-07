import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { RoutineProfileStore } from '../../domain/ports';
import { ProfileMembership, RoutineDefinition, RoutineProfile } from '../../domain/routine';
import {
  profileMembershipToPowerSync,
  routineDefinitionToPowerSync,
  routineProfileToPowerSync,
  type ProfileMembershipPowerSyncRecord,
  type RoutineDefinitionPowerSyncRecord,
  type RoutineProfilePowerSyncRecord,
} from './profile-persistence-parity';
import { deserializeRoutineTrigger } from './trigger-persistence-parity';

export class PowerSyncRoutineProfileStore implements RoutineProfileStore {
  constructor(private readonly db: IElectronDatabase) {}

  async upsertDefinition(definition: RoutineDefinition): Promise<void> {
    const row = routineDefinitionToPowerSync(definition.snapshot());
    await this.db.writeTransaction((tx) => upsertDefinition(tx, row));
  }

  async findDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineDefinition | null> {
    const row = await this.db.getOptional<RoutineDefinitionPowerSyncRecord>(
      `SELECT id, identity_id, name, description, enabled, trigger_json, version, created_at, updated_at
       FROM routine_definitions WHERE id = ? AND identity_id = ? LIMIT 1`,
      [input.routineId, input.identityId],
    );
    return row ? mapDefinition(row) : null;
  }

  async deleteDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.db.execute('DELETE FROM routine_definitions WHERE id = ? AND identity_id = ?', [
      input.routineId,
      input.identityId,
    ]);
  }

  async upsertProfile(profile: RoutineProfile): Promise<void> {
    const row = routineProfileToPowerSync(profile.snapshot());
    await this.db.writeTransaction((tx) => upsertProfile(tx, row));
  }

  async findProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<RoutineProfile | null> {
    const row = await this.db.getOptional<RoutineProfilePowerSyncRecord>(
      `SELECT id, identity_id, name, description, enabled, active, version, created_at, updated_at
       FROM routine_profiles WHERE id = ? AND identity_id = ? LIMIT 1`,
      [input.profileId, input.identityId],
    );
    return row ? mapProfile(row) : null;
  }

  async listProfiles(input: { readonly identityId: string }): Promise<RoutineProfile[]> {
    const rows = await this.db.getAll<RoutineProfilePowerSyncRecord>(
      `SELECT id, identity_id, name, description, enabled, active, version, created_at, updated_at
       FROM routine_profiles WHERE identity_id = ? ORDER BY created_at ASC, id ASC`,
      [input.identityId],
    );
    return rows.map(mapProfile);
  }

  async deleteProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<void> {
    await this.db.execute('DELETE FROM routine_profiles WHERE id = ? AND identity_id = ?', [
      input.profileId,
      input.identityId,
    ]);
  }

  async upsertMembership(membership: ProfileMembership): Promise<void> {
    const row = profileMembershipToPowerSync(membership.snapshot());
    await this.db.writeTransaction((tx) => upsertMembership(tx, row));
  }

  async listMembershipsForRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<ProfileMembership[]> {
    const rows = await this.db.getAll<ProfileMembershipPowerSyncRecord>(
      `SELECT identity_id, profile_id, routine_id, enabled, version, created_at, updated_at
       FROM routine_profile_memberships
       WHERE identity_id = ? AND routine_id = ?
       ORDER BY profile_id ASC`,
      [input.identityId, input.routineId],
    );
    return rows.map(mapMembership);
  }

  async listMembershipsForProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<ProfileMembership[]> {
    const rows = await this.db.getAll<ProfileMembershipPowerSyncRecord>(
      `SELECT identity_id, profile_id, routine_id, enabled, version, created_at, updated_at
       FROM routine_profile_memberships
       WHERE identity_id = ? AND profile_id = ?
       ORDER BY routine_id ASC`,
      [input.identityId, input.profileId],
    );
    return rows.map(mapMembership);
  }

  async deleteMembership(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.db.execute(
      `DELETE FROM routine_profile_memberships
       WHERE identity_id = ? AND profile_id = ? AND routine_id = ?`,
      [input.identityId, input.profileId, input.routineId],
    );
  }

  async replaceRoutineMemberships(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly memberships: readonly ProfileMembership[];
  }): Promise<void> {
    assertMembershipSet(input);
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        'DELETE FROM routine_profile_memberships WHERE identity_id = ? AND routine_id = ?',
        [input.identityId, input.routineId],
      );
      for (const membership of input.memberships) {
        await insertMembership(tx, profileMembershipToPowerSync(membership.snapshot()));
      }
    });
  }
}

async function upsertDefinition(
  tx: IElectronDatabaseTransaction,
  row: RoutineDefinitionPowerSyncRecord,
): Promise<void> {
  const existing = await tx.getOptional<{ id: string }>(
    'SELECT id FROM routine_definitions WHERE id = ? AND identity_id = ? LIMIT 1',
    [row.id, row.identity_id],
  );
  if (existing) {
    await tx.execute(
      `UPDATE routine_definitions
       SET name = ?, description = ?, enabled = ?, trigger_json = ?, version = ?, updated_at = ?
       WHERE id = ? AND identity_id = ?`,
      [
        row.name,
        row.description,
        row.enabled,
        row.trigger_json,
        row.version,
        row.updated_at,
        row.id,
        row.identity_id,
      ],
    );
    return;
  }
  await tx.execute(
    `INSERT INTO routine_definitions
      (id, identity_id, name, description, enabled, trigger_json, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.identity_id,
      row.name,
      row.description,
      row.enabled,
      row.trigger_json,
      row.version,
      row.created_at,
      row.updated_at,
    ],
  );
}

async function upsertProfile(
  tx: IElectronDatabaseTransaction,
  row: RoutineProfilePowerSyncRecord,
): Promise<void> {
  const existing = await tx.getOptional<{ id: string }>(
    'SELECT id FROM routine_profiles WHERE id = ? AND identity_id = ? LIMIT 1',
    [row.id, row.identity_id],
  );
  if (existing) {
    await tx.execute(
      `UPDATE routine_profiles
       SET name = ?, description = ?, enabled = ?, active = ?, version = ?, updated_at = ?
       WHERE id = ? AND identity_id = ?`,
      [
        row.name,
        row.description,
        row.enabled,
        row.active,
        row.version,
        row.updated_at,
        row.id,
        row.identity_id,
      ],
    );
    return;
  }
  await tx.execute(
    `INSERT INTO routine_profiles
      (id, identity_id, name, description, enabled, active, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.identity_id,
      row.name,
      row.description,
      row.enabled,
      row.active,
      row.version,
      row.created_at,
      row.updated_at,
    ],
  );
}

async function upsertMembership(
  tx: IElectronDatabaseTransaction,
  row: ProfileMembershipPowerSyncRecord,
): Promise<void> {
  const existing = await tx.getOptional<{ routine_id: string }>(
    `SELECT routine_id FROM routine_profile_memberships
     WHERE identity_id = ? AND profile_id = ? AND routine_id = ? LIMIT 1`,
    [row.identity_id, row.profile_id, row.routine_id],
  );
  if (existing) {
    await tx.execute(
      `UPDATE routine_profile_memberships
       SET enabled = ?, version = ?, updated_at = ?
       WHERE identity_id = ? AND profile_id = ? AND routine_id = ?`,
      [row.enabled, row.version, row.updated_at, row.identity_id, row.profile_id, row.routine_id],
    );
    return;
  }
  await insertMembership(tx, row);
}

async function insertMembership(
  tx: IElectronDatabaseTransaction,
  row: ProfileMembershipPowerSyncRecord,
): Promise<void> {
  await tx.execute(
    `INSERT INTO routine_profile_memberships
      (identity_id, profile_id, routine_id, enabled, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.identity_id,
      row.profile_id,
      row.routine_id,
      row.enabled,
      row.version,
      row.created_at,
      row.updated_at,
    ],
  );
}

function mapDefinition(row: RoutineDefinitionPowerSyncRecord): RoutineDefinition {
  return RoutineDefinition.load({
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    trigger: deserializeRoutineTrigger(row.trigger_json),
    version: Number(row.version),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

function mapProfile(row: RoutineProfilePowerSyncRecord): RoutineProfile {
  return RoutineProfile.load({
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    active: row.active === 1,
    version: Number(row.version),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

function mapMembership(row: ProfileMembershipPowerSyncRecord): ProfileMembership {
  return ProfileMembership.load({
    identityId: row.identity_id,
    profileId: row.profile_id,
    routineId: row.routine_id,
    enabled: row.enabled === 1,
    version: Number(row.version),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

function assertMembershipSet(input: {
  readonly identityId: string;
  readonly routineId: string;
  readonly memberships: readonly ProfileMembership[];
}): void {
  const seen = new Set<string>();
  for (const membership of input.memberships) {
    if (membership.identityId !== input.identityId || membership.routineId !== input.routineId) {
      throw new TypeError('Routine membership replacement ownership mismatch');
    }
    if (seen.has(membership.profileId)) {
      throw new TypeError(`Duplicate Routine profile membership '${membership.profileId}'`);
    }
    seen.add(membership.profileId);
  }
}
