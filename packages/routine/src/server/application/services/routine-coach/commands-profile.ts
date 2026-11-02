import { RoutineProfile } from '../../../domain/routine';
import type { RoutineCoachCommandPort } from '../routine-coach-command.service';
import {
  routineConflict,
  routineNotFound,
  type RoutineCoachCommandContext,
} from './command-context';

export function createProfileCommands(
  ctx: RoutineCoachCommandContext,
): Pick<RoutineCoachCommandPort, 'createProfile' | 'updateProfile' | 'deleteProfile'> {
  const { options, now, notifyScheduleChanged } = ctx;
  return {
    async createProfile(input) {
      const profile = RoutineProfile.create({
        id: input.profileId,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        now: new Date(input.at ?? now()),
      });
      const existing = input.profileId
        ? await options.routineProfileStore.findProfile({
            identityId: input.identityId,
            profileId: input.profileId,
          })
        : null;
      if (existing) {
        if (
          existing.name !== profile.name ||
          existing.description !== profile.description ||
          existing.enabled !== profile.enabled
        ) {
          throw routineConflict(`Profile '${profile.id}' already exists with different data`);
        }
        return {
          profileId: existing.id,
          identityId: existing.identityId,
          name: existing.name,
          version: existing.version,
        };
      }
      await options.routineProfileStore.upsertProfile(profile);
      return {
        profileId: profile.id,
        identityId: profile.identityId,
        name: profile.name,
        version: profile.version,
      };
    },

    async updateProfile(input) {
      const profile = await options.routineProfileStore.findProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (!profile) throw routineNotFound(`Profile '${input.profileId}' was not found`);
      if (profile.version !== input.expectedVersion)
        throw routineConflict(`Profile '${input.profileId}' version conflict`);
      profile.update(
        { name: input.name, description: input.description, enabled: input.enabled },
        new Date(input.at ?? now()),
      );
      await options.routineProfileStore.updateProfile({
        profile,
        expectedVersion: input.expectedVersion,
      });
      const affectedMemberships = await options.routineProfileStore.listMembershipsForProfile({
        identityId: profile.identityId,
        profileId: profile.id,
      });
      for (const membership of affectedMemberships) {
        await notifyScheduleChanged(profile.identityId, membership.routineId);
      }
      return {
        profileId: profile.id,
        identityId: profile.identityId,
        name: profile.name,
        version: profile.version,
      };
    },

    async deleteProfile(input) {
      const memberships = await options.routineProfileStore.listMembershipsForProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (memberships.length > 0)
        throw routineConflict(`Profile '${input.profileId}' still has Routine memberships`);
      await options.routineProfileStore.deleteProfile(input);
      return { identityId: input.identityId, profileId: input.profileId };
    },
  };
}
