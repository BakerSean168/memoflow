import { RoutinePreferences } from '../../../domain/routine';
import type { RoutineCoachCommandPort } from '../routine-coach-command.service';
import { routineConflict, type RoutineCoachCommandContext } from './command-context';

export function createPreferencesCommands(
  ctx: RoutineCoachCommandContext,
): Pick<RoutineCoachCommandPort, 'updatePreferences'> {
  const { options, now, notifyScheduleChanged } = ctx;
  return {
    async updatePreferences(input) {
      const store = options.routinePreferencesStore;
      if (!store) throw new TypeError('Routine preferences store is unavailable');
      const existing = await store.find({ identityId: input.identityId });

      if (!existing) {
        if (input.expectedVersion !== 0) {
          throw routineConflict('Routine preferences version conflict');
        }
        const preferences = RoutinePreferences.create({
          identityId: input.identityId,
          globalEnabled: input.globalEnabled,
          now: new Date(input.at ?? now()),
        });
        try {
          await store.create({ preferences });
        } catch {
          throw routineConflict('Routine preferences version conflict');
        }
        await options.onGlobalEnabledChanged?.({
          identityId: input.identityId,
          globalEnabled: preferences.globalEnabled,
        });
        const definitions = await options.routineProfileStore.listDefinitions({
          identityId: input.identityId,
        });
        for (const definition of definitions) {
          await notifyScheduleChanged(input.identityId, definition.id);
        }
        return {
          identityId: preferences.identityId,
          globalEnabled: preferences.globalEnabled,
          version: preferences.version,
        };
      }

      if (existing.version !== input.expectedVersion) {
        throw routineConflict('Routine preferences version conflict');
      }
      const previousVersion = existing.version;
      const changed = existing.setGlobalEnabled(input.globalEnabled, new Date(input.at ?? now()));
      if (changed) {
        try {
          await store.update({
            preferences: existing,
            expectedVersion: previousVersion,
          });
        } catch {
          throw routineConflict('Routine preferences version conflict');
        }
        await options.onGlobalEnabledChanged?.({
          identityId: input.identityId,
          globalEnabled: existing.globalEnabled,
        });
        const definitions = await options.routineProfileStore.listDefinitions({
          identityId: input.identityId,
        });
        for (const definition of definitions) {
          await notifyScheduleChanged(input.identityId, definition.id);
        }
      }
      return {
        identityId: existing.identityId,
        globalEnabled: existing.globalEnabled,
        version: existing.version,
      };
    },
  };
}
