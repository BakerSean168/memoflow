import type { RoutineRuntimeContext } from '../domain/routine';
import type {
  RoutineRuntimeContextStore,
  RoutineRuntimeContextUpdateReceipt,
} from '../domain/ports';

interface RuntimeContextState {
  readonly activeProfileIds: Set<string>;
  version: number;
}

export function createInMemoryRoutineRuntimeContextStore(): RoutineRuntimeContextStore {
  const contexts = new Map<string, RuntimeContextState>();

  return {
    get({ identityId }): RoutineRuntimeContext {
      const state = contexts.get(identityId);
      return { activeProfileIds: state ? Array.from(state.activeProfileIds).sort() : [] };
    },

    setProfileActive({ identityId, profileId, active }): RoutineRuntimeContextUpdateReceipt {
      let state = contexts.get(identityId);
      if (!state) {
        state = { activeProfileIds: new Set(), version: 0 };
        contexts.set(identityId, state);
      }
      const changed = active
        ? !state.activeProfileIds.has(profileId)
        : state.activeProfileIds.has(profileId);
      if (active) state.activeProfileIds.add(profileId);
      else state.activeProfileIds.delete(profileId);
      if (changed) state.version += 1;
      return { identityId, profileId, active, version: state.version };
    },
  };
}
