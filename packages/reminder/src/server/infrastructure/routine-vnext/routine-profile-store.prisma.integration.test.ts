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
      active: true,
      now,
    });
    const gaming = RoutineProfile.create({
      id: 'gaming',
      identityId,
      name: 'Gaming',
      enabled: true,
      active: false,
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
      { id: work.id, active: true },
    );
    expect(
      (await store.listMembershipsForRoutine({ identityId, routineId: routine.id })).map(
        (membership) => [membership.profileId, membership.enabled],
      ),
    ).toEqual([
      ['gaming', false],
      ['work', true],
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
