import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../__tests__/integration-helpers';
import {
  createElapsedTrigger,
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
} from '../../domain/routine';
import { PrismaRoutineProfileStore } from './routine-profile-store.prisma';

describe('PrismaRoutineProfileStore integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('creates a RoutineDefinition and memberships atomically', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    const store = new PrismaRoutineProfileStore(prisma);
    const now = new Date('2026-09-07T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'atomic-routine',
      identityId,
      name: 'Atomic Routine',
      trigger: createElapsedTrigger({ durationMs: 45 * 60_000 }),
      now,
    });
    const work = RoutineProfile.create({ id: 'atomic-work', identityId, name: 'Work', now });
    const study = RoutineProfile.create({ id: 'atomic-study', identityId, name: 'Study', now });
    await store.upsertProfile(work);
    await store.upsertProfile(study);

    await store.createDefinitionWithMemberships({
      definition: routine,
      memberships: [work, study].map((profile) =>
        ProfileMembership.create({ identityId, profileId: profile.id, routineId: routine.id, now }),
      ),
    });

    expect(await store.findDefinition({ identityId, routineId: routine.id })).toMatchObject({
      id: routine.id,
      name: 'Atomic Routine',
    });
    expect(
      (await store.listMembershipsForRoutine({ identityId, routineId: routine.id }))
        .map((membership) => membership.profileId)
        .sort(),
    ).toEqual(['atomic-study', 'atomic-work']);
  });

  it('rejects invalid atomic creation without leaving a definition', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    const store = new PrismaRoutineProfileStore(prisma);
    const now = new Date('2026-09-07T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'invalid-atomic-routine',
      identityId,
      name: 'Invalid Atomic Routine',
      now,
    });
    const missingMembership = ProfileMembership.create({
      identityId,
      profileId: 'missing-profile',
      routineId: routine.id,
      now,
    });

    await expect(
      store.createDefinitionWithMemberships({
        definition: routine,
        memberships: [missingMembership],
      }),
    ).rejects.toThrow(/was not found/);
    expect(await store.findDefinition({ identityId, routineId: routine.id })).toBeNull();
  });

  it('rejects duplicate and foreign-identity memberships before mutation', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    const foreignIdentityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    await seedAccount({ id: foreignIdentityId });
    const store = new PrismaRoutineProfileStore(prisma);
    const now = new Date('2026-09-07T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'validation-routine',
      identityId,
      name: 'Validation Routine',
      now,
    });
    const profile = RoutineProfile.create({
      id: 'validation-profile',
      identityId,
      name: 'Work',
      now,
    });
    const foreignProfile = RoutineProfile.create({
      id: 'foreign-profile',
      identityId: foreignIdentityId,
      name: 'Foreign',
      now,
    });
    await store.upsertProfile(profile);
    await store.upsertProfile(foreignProfile);
    const membership = ProfileMembership.create({
      identityId,
      profileId: profile.id,
      routineId: routine.id,
      now,
    });

    await expect(
      store.createDefinitionWithMemberships({
        definition: routine,
        memberships: [membership, membership],
      }),
    ).rejects.toThrow(/Duplicate Routine profile membership/);
    await expect(
      store.createDefinitionWithMemberships({
        definition: routine,
        memberships: [
          ProfileMembership.create({
            identityId,
            profileId: foreignProfile.id,
            routineId: routine.id,
            now,
          }),
        ],
      }),
    ).rejects.toThrow(/ownership mismatch/);
    expect(await store.findDefinition({ identityId, routineId: routine.id })).toBeNull();
  });

  it('round-trips Routine/Profile M:N membership and replaces one routine edge set transactionally', async () => {
    const prisma = await getPrisma();
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId });
    const store = new PrismaRoutineProfileStore(prisma);
    const now = new Date('2026-09-07T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'drink-water',
      identityId,
      name: 'Drink Water',
      trigger: createElapsedTrigger({ durationMs: 60 * 60_000 }),
      now,
    });
    const work = RoutineProfile.create({
      id: 'work',
      identityId,
      name: 'Work',
      enabled: true,
      now,
    });
    const gaming = RoutineProfile.create({
      id: 'gaming',
      identityId,
      name: 'Gaming',
      enabled: true,
      now,
    });
    await store.upsertDefinition(routine);
    await store.upsertProfile(work);
    await store.upsertProfile(gaming);

    const workMembership = ProfileMembership.create({
      identityId,
      profileId: work.id,
      routineId: routine.id,
      enabled: true,
      now,
    });
    const gamingMembership = ProfileMembership.create({
      identityId,
      profileId: gaming.id,
      routineId: routine.id,
      enabled: false,
      now,
    });
    await store.replaceRoutineMemberships({
      identityId,
      routineId: routine.id,
      memberships: [workMembership, gamingMembership],
    });

    expect(
      (await store.findDefinition({ identityId, routineId: routine.id }))?.snapshot(),
    ).toMatchObject({ id: routine.id, identityId, name: 'Drink Water' });
    expect((await store.findProfile({ identityId, profileId: work.id }))?.snapshot()).toMatchObject(
      { id: work.id, enabled: true },
    );
    expect(
      (
        await store.findProfilesByIds({ identityId, profileIds: [gaming.id, 'missing', work.id] })
      ).map((profile) => profile.id),
    ).toEqual(['gaming', 'work']);
    expect(
      (await store.listMembershipsForRoutine({ identityId, routineId: routine.id })).map(
        (membership) => [membership.profileId, membership.enabled],
      ),
    ).toEqual([
      ['gaming', false],
      ['work', true],
    ]);
    expect(
      (
        await store.listMembershipsForRoutines({
          identityId,
          routineIds: [routine.id, 'missing-routine'],
        })
      ).map((membership) => [membership.routineId, membership.profileId]),
    ).toEqual([
      [routine.id, 'gaming'],
      [routine.id, 'work'],
    ]);

    await store.replaceRoutineMemberships({
      identityId,
      routineId: routine.id,
      memberships: [gamingMembership],
    });
    expect(await store.listMembershipsForProfile({ identityId, profileId: work.id })).toEqual([]);
    expect(
      (await store.listMembershipsForRoutine({ identityId, routineId: routine.id })).map(
        (membership) => membership.profileId,
      ),
    ).toEqual(['gaming']);
  });
});
