import { describe, expect, it } from 'vitest';
import {
  createElapsedTrigger,
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
} from '../../domain/routine';
import {
  normalizePowerSyncMembership,
  normalizePowerSyncRoutineDefinition,
  normalizePowerSyncRoutineProfile,
  normalizePrismaMembership,
  normalizePrismaRoutineDefinition,
  normalizePrismaRoutineProfile,
  profileMembershipToPowerSync,
  profileMembershipToPrisma,
  ROUTINE_PROFILE_PERSISTENCE_TABLES,
  routineDefinitionToPowerSync,
  routineDefinitionToPrisma,
  routineProfileToPowerSync,
  routineProfileToPrisma,
} from './profile-persistence-parity';

describe('Routine vNext Prisma / PowerSync parity contract', () => {
  it('keeps definition/profile/membership truth identical across both representations', () => {
    const now = new Date('2026-08-25T15:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'drink-water',
      identityId: 'identity-1',
      name: 'Drink Water',
      description: 'Hydration intervention',
      enabled: true,
      trigger: createElapsedTrigger({ durationMs: 60 * 60_000 }),
      now,
    });
    const profile = RoutineProfile.create({
      id: 'gaming',
      identityId: 'identity-1',
      name: 'Gaming',
      enabled: true,
      now,
    });
    const membership = ProfileMembership.create({
      identityId: 'identity-1',
      profileId: profile.id,
      routineId: routine.id,
      enabled: false,
      now,
    });

    const prismaDefinition = routineDefinitionToPrisma(routine.snapshot());
    const powerSyncDefinition = routineDefinitionToPowerSync(routine.snapshot());
    expect(prismaDefinition.triggerJson).toContain('\"type\":\"Elapsed\"');
    expect(normalizePrismaRoutineDefinition(prismaDefinition)).toEqual(
      normalizePowerSyncRoutineDefinition(powerSyncDefinition),
    );
    expect(normalizePrismaRoutineProfile(routineProfileToPrisma(profile.snapshot()))).toEqual(
      normalizePowerSyncRoutineProfile(routineProfileToPowerSync(profile.snapshot())),
    );
    expect(normalizePrismaMembership(profileMembershipToPrisma(membership.snapshot()))).toEqual(
      normalizePowerSyncMembership(profileMembershipToPowerSync(membership.snapshot())),
    );
  });

  it('uses a dedicated M:N membership table rather than a single group foreign key', () => {
    expect(ROUTINE_PROFILE_PERSISTENCE_TABLES).toEqual({
      definitions: 'routine_definitions',
      profiles: 'routine_profiles',
      memberships: 'routine_profile_memberships',
    });
  });
});
