import { ProfileMembership, RoutineDefinition } from '../../../domain/routine';
import type { RoutineCoachCommandPort } from '../routine-coach-command.service';
import {
  routineConflict,
  routineNotFound,
  type RoutineCoachCommandContext,
} from './command-context';

export function createRoutineCommands(
  ctx: RoutineCoachCommandContext,
): Pick<RoutineCoachCommandPort, 'createRoutine' | 'updateRoutine' | 'deleteRoutine'> {
  const { options, now, notifyScheduleChanged } = ctx;
  return {
    async createRoutine(input) {
      const at = input.at ?? now();
      const profileIds = [...(input.profileIds ?? [])];
      const uniqueProfileIds = new Set(profileIds);
      if (uniqueProfileIds.size !== profileIds.length) {
        throw new TypeError('Duplicate Routine profile membership');
      }
      const profiles = await options.routineProfileStore.findProfilesByIds({
        identityId: input.identityId,
        profileIds,
      });
      if (profiles.length !== profileIds.length) {
        throw routineNotFound('One or more Routine profiles were not found');
      }
      const routine = RoutineDefinition.create({
        id: input.routineId,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        trigger: input.trigger ?? null,
        now: new Date(at),
      });
      const memberships = profileIds.map((profileId) =>
        ProfileMembership.create({
          identityId: input.identityId,
          profileId,
          routineId: routine.id,
          now: new Date(at),
        }),
      );
      const existing = input.routineId
        ? await options.routineProfileStore.findDefinition({
            identityId: input.identityId,
            routineId: input.routineId,
          })
        : null;
      if (existing) {
        if (
          existing.name !== routine.name ||
          existing.description !== routine.description ||
          existing.enabled !== routine.enabled ||
          JSON.stringify(existing.trigger) !== JSON.stringify(routine.trigger)
        ) {
          throw routineConflict(`Routine '${routine.id}' already exists with different data`);
        }
        await notifyScheduleChanged(existing.identityId, existing.id);
        return {
          routineId: existing.id,
          identityId: existing.identityId,
          name: existing.name,
          version: existing.version,
        };
      }
      await options.routineProfileStore.createDefinitionWithMemberships({
        definition: routine,
        memberships,
      });
      await notifyScheduleChanged(routine.identityId, routine.id);
      return {
        routineId: routine.id,
        identityId: routine.identityId,
        name: routine.name,
        version: routine.version,
      };
    },

    async updateRoutine(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      if (routine.version !== input.expectedVersion)
        throw routineConflict(`Routine '${input.routineId}' version conflict`);
      routine.update(
        {
          name: input.name,
          description: input.description,
          enabled: input.enabled,
          trigger: input.trigger,
        },
        new Date(input.at ?? now()),
      );
      await options.routineProfileStore.updateDefinition({
        definition: routine,
        expectedVersion: input.expectedVersion,
      });
      await notifyScheduleChanged(routine.identityId, routine.id);
      return {
        routineId: routine.id,
        identityId: routine.identityId,
        name: routine.name,
        version: routine.version,
      };
    },

    async deleteRoutine(input) {
      await options.routineProfileStore.deleteDefinition(input);
      await notifyScheduleChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId };
    },
  };
}
