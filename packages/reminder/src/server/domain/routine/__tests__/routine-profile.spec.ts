import { describe, expect, it } from 'vitest';
import {
  evaluateRoutineMembershipEligibility,
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
} from '..';

describe('RoutineDefinition + RoutineProfile + ProfileMembership', () => {
  it('keeps independent membership state for the same routine in Work and Gaming profiles', () => {
    const routine = RoutineDefinition.create({
      id: 'drink-water',
      identityId: 'identity-1',
      name: 'Drink Water',
      enabled: true,
    });
    const work = RoutineProfile.create({
      id: 'work',
      identityId: 'identity-1',
      name: 'Work',
      enabled: true,
    });
    const gaming = RoutineProfile.create({
      id: 'gaming',
      identityId: 'identity-1',
      name: 'Gaming',
      enabled: true,
    });
    const workMembership = ProfileMembership.create({
      identityId: 'identity-1',
      routineId: routine.id,
      profileId: work.id,
      enabled: true,
    });
    const gamingMembership = ProfileMembership.create({
      identityId: 'identity-1',
      routineId: routine.id,
      profileId: gaming.id,
      enabled: false,
    });

    expect(
      evaluateRoutineMembershipEligibility({
        routine,
        profile: work,
        membership: workMembership,
      }).eligible,
    ).toBe(true);
    expect(
      evaluateRoutineMembershipEligibility({
        routine,
        profile: gaming,
        membership: gamingMembership,
      }).eligible,
    ).toBe(false);
  });

  it('profile off preserves membership enabled state and profile on does not revive disabled membership', () => {
    const routine = RoutineDefinition.create({
      id: 'stand-up',
      identityId: 'identity-1',
      name: 'Stand Up',
    });
    const profile = RoutineProfile.create({
      id: 'work',
      identityId: 'identity-1',
      name: 'Work',
      enabled: true,
    });
    const membership = ProfileMembership.create({
      identityId: 'identity-1',
      routineId: routine.id,
      profileId: profile.id,
      enabled: false,
    });

    profile.disable();
    expect(membership.enabled).toBe(false);
    expect(
      evaluateRoutineMembershipEligibility({ routine, profile, membership }).reasonCodes,
    ).toEqual(expect.arrayContaining(['profile-disabled', 'membership-disabled']));

    profile.enable();
    expect(membership.enabled).toBe(false);
    expect(evaluateRoutineMembershipEligibility({ routine, profile, membership }).eligible).toBe(
      false,
    );
  });

  it('uses a strict AND across routine, profile enabled/active, membership and temporary override', () => {
    const routine = RoutineDefinition.create({
      identityId: 'identity-1',
      name: '20-20-20',
    });
    const profile = RoutineProfile.create({
      identityId: 'identity-1',
      name: 'Work',
      enabled: true,
    });
    const membership = ProfileMembership.create({
      identityId: 'identity-1',
      routineId: routine.id,
      profileId: profile.id,
    });

    expect(
      evaluateRoutineMembershipEligibility({
        routine,
        profile,
        membership,
        temporaryOverrideAllowsExecution: false,
      }),
    ).toMatchObject({
      eligible: false,
      reasonCodes: ['temporary-override'],
    });
  });

  it('rejects cross-identity or mismatched membership evaluation', () => {
    const routine = RoutineDefinition.create({ identityId: 'a', name: 'Hydration' });
    const profile = RoutineProfile.create({ identityId: 'b', name: 'Work' });
    const membership = ProfileMembership.create({
      identityId: 'a',
      routineId: routine.id,
      profileId: profile.id,
    });

    expect(() => evaluateRoutineMembershipEligibility({ routine, profile, membership })).toThrow(
      'ownership mismatch',
    );
  });
});
