import type { PrismaClient } from '@memoflow/database';
import type { RoutineProfileStore } from '../../domain/ports';
import { ProfileMembership, RoutineDefinition, RoutineProfile } from '../../domain/routine';
import {
  profileMembershipToPrisma,
  routineDefinitionToPrisma,
  routineProfileToPrisma,
} from './profile-persistence-parity';
import { deserializeRoutineTrigger } from './trigger-persistence-parity';

export class PrismaRoutineProfileStore implements RoutineProfileStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertDefinition(definition: RoutineDefinition): Promise<void> {
    const data = routineDefinitionToPrisma(definition.snapshot());
    await this.prisma.routineDefinition.upsert({
      where: { identityId_id: { identityId: data.identityId, id: data.id } },
      create: data,
      update: {
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        triggerJson: data.triggerJson,
        version: data.version,
        updatedAt: data.updatedAt,
      },
    });
  }

  async createDefinitionWithMemberships(input: {
    readonly definition: RoutineDefinition;
    readonly memberships: readonly ProfileMembership[];
  }): Promise<void> {
    assertDefinitionCreation(input);
    const definitionData = routineDefinitionToPrisma(input.definition.snapshot());
    const membershipData = input.memberships.map((membership) =>
      profileMembershipToPrisma(membership.snapshot()),
    );
    await this.prisma.$transaction(async (tx) => {
      const existingDefinition = await tx.routineDefinition.findUnique({
        where: { id: definitionData.id },
      });
      if (existingDefinition) {
        throw new TypeError(
          existingDefinition.identityId === definitionData.identityId
            ? `Routine '${definitionData.id}' already exists`
            : `Routine '${definitionData.id}' belongs to another identity`,
        );
      }
      if (membershipData.length > 0) {
        const profiles = await tx.routineProfile.findMany({
          where: { id: { in: membershipData.map((membership) => membership.profileId) } },
        });
        const profilesById = new Map(profiles.map((profile) => [profile.id, profile.identityId]));
        for (const membership of membershipData) {
          const profileIdentity = profilesById.get(membership.profileId);
          if (!profileIdentity) {
            throw new TypeError(`Routine profile '${membership.profileId}' was not found`);
          }
          if (profileIdentity !== definitionData.identityId) {
            throw new TypeError('Routine creation profile ownership mismatch');
          }
        }
      }
      await tx.routineDefinition.create({ data: definitionData });
      for (const data of membershipData) {
        await tx.routineProfileMembership.create({ data });
      }
    });
  }

  async findDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineDefinition | null> {
    const row = await this.prisma.routineDefinition.findUnique({
      where: { identityId_id: { identityId: input.identityId, id: input.routineId } },
    });
    return row
      ? RoutineDefinition.load({
          id: row.id,
          identityId: row.identityId,
          name: row.name,
          description: row.description,
          enabled: row.enabled,
          trigger: deserializeRoutineTrigger(row.triggerJson),
          version: row.version,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      : null;
  }

  async deleteDefinition(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.prisma.routineDefinition.deleteMany({
      where: { id: input.routineId, identityId: input.identityId },
    });
  }

  async upsertProfile(profile: RoutineProfile): Promise<void> {
    const data = routineProfileToPrisma(profile.snapshot());
    await this.prisma.routineProfile.upsert({
      where: { identityId_id: { identityId: data.identityId, id: data.id } },
      create: data,
      update: {
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        version: data.version,
        updatedAt: data.updatedAt,
      },
    });
  }

  async findProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<RoutineProfile | null> {
    const row = await this.prisma.routineProfile.findUnique({
      where: { identityId_id: { identityId: input.identityId, id: input.profileId } },
    });
    return row
      ? RoutineProfile.load({
          id: row.id,
          identityId: row.identityId,
          name: row.name,
          description: row.description,
          enabled: row.enabled,

          version: row.version,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      : null;
  }

  async listProfiles(input: { readonly identityId: string }): Promise<RoutineProfile[]> {
    const rows = await this.prisma.routineProfile.findMany({
      where: { identityId: input.identityId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) =>
      RoutineProfile.load({
        id: row.id,
        identityId: row.identityId,
        name: row.name,
        description: row.description,
        enabled: row.enabled,

        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findProfilesByIds(input: {
    readonly identityId: string;
    readonly profileIds: readonly string[];
  }): Promise<RoutineProfile[]> {
    if (input.profileIds.length === 0) return [];
    const rows = await this.prisma.routineProfile.findMany({
      where: { identityId: input.identityId, id: { in: [...input.profileIds] } },
      orderBy: [{ id: 'asc' }],
    });
    return rows.map((row) =>
      RoutineProfile.load({
        id: row.id,
        identityId: row.identityId,
        name: row.name,
        description: row.description,
        enabled: row.enabled,

        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async deleteProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<void> {
    await this.prisma.routineProfile.deleteMany({
      where: { id: input.profileId, identityId: input.identityId },
    });
  }

  async upsertMembership(membership: ProfileMembership): Promise<void> {
    const data = profileMembershipToPrisma(membership.snapshot());
    await this.prisma.routineProfileMembership.upsert({
      where: {
        identityId_profileId_routineId: {
          identityId: data.identityId,
          profileId: data.profileId,
          routineId: data.routineId,
        },
      },
      create: data,
      update: {
        enabled: data.enabled,
        version: data.version,
        updatedAt: data.updatedAt,
      },
    });
  }

  async listMembershipsForRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<ProfileMembership[]> {
    const rows = await this.prisma.routineProfileMembership.findMany({
      where: { identityId: input.identityId, routineId: input.routineId },
      orderBy: [{ profileId: 'asc' }],
    });
    return rows.map(mapMembership);
  }

  async listMembershipsForRoutines(input: {
    readonly identityId: string;
    readonly routineIds: readonly string[];
  }): Promise<ProfileMembership[]> {
    if (input.routineIds.length === 0) return [];
    const rows = await this.prisma.routineProfileMembership.findMany({
      where: { identityId: input.identityId, routineId: { in: [...input.routineIds] } },
      orderBy: [{ routineId: 'asc' }, { profileId: 'asc' }],
    });
    return rows.map(mapMembership);
  }

  async listMembershipsForProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<ProfileMembership[]> {
    const rows = await this.prisma.routineProfileMembership.findMany({
      where: { identityId: input.identityId, profileId: input.profileId },
      orderBy: [{ routineId: 'asc' }],
    });
    return rows.map(mapMembership);
  }

  async deleteMembership(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.prisma.routineProfileMembership.deleteMany({
      where: {
        identityId: input.identityId,
        profileId: input.profileId,
        routineId: input.routineId,
      },
    });
  }

  async replaceRoutineMemberships(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly memberships: readonly ProfileMembership[];
  }): Promise<void> {
    assertMembershipSet(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.routineProfileMembership.deleteMany({
        where: { identityId: input.identityId, routineId: input.routineId },
      });
      for (const membership of input.memberships) {
        const data = profileMembershipToPrisma(membership.snapshot());
        await tx.routineProfileMembership.create({ data });
      }
    });
  }
}

function mapMembership(row: {
  identityId: string;
  profileId: string;
  routineId: string;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): ProfileMembership {
  return ProfileMembership.load({ ...row });
}

function assertDefinitionCreation(input: {
  readonly definition: RoutineDefinition;
  readonly memberships: readonly ProfileMembership[];
}): void {
  const definition = input.definition;
  if (!definition.identityId.trim() || !definition.id.trim()) {
    throw new TypeError('Routine definition ownership is invalid');
  }
  assertMembershipSet({
    identityId: definition.identityId,
    routineId: definition.id,
    memberships: input.memberships,
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
