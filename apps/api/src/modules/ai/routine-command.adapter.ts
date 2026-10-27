import type { IAIRoutineCommandPort } from '@memoflow/ai';
import { createRoutineCommandAdapter, type RoutineCommandAdapterDeps } from '@memoflow/ai/adapters';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createWallClockTrigger,
} from '@memoflow/routine/server';
import type { RoutineCoachCommandPort } from '@memoflow/routine/routine-runtime';

/**
 * API-host binding for the canonical `@memoflow/ai/adapters` Routine factory.
 * The host only supplies its Routine owner port and canonical trigger builders.
 */
export class RoutineAICommandAdapter implements IAIRoutineCommandPort {
  readonly #port: IAIRoutineCommandPort;

  constructor(routine: RoutineCoachCommandPort) {
    const deps: RoutineCommandAdapterDeps = {
      routine,
      triggers: {
        wallClock: (input) => createWallClockTrigger(input),
        elapsed: (input) => createElapsedTrigger(input),
        activeUsage: (input) => createActiveUsageTrigger(input),
      },
    };
    this.#port = createRoutineCommandAdapter(deps);
  }

  createRoutine(input: Parameters<IAIRoutineCommandPort['createRoutine']>[0]) {
    return this.#port.createRoutine(input);
  }

  setProfileActive(input: Parameters<IAIRoutineCommandPort['setProfileActive']>[0]) {
    return this.#port.setProfileActive(input);
  }

  setTemporaryOverride(input: Parameters<IAIRoutineCommandPort['setTemporaryOverride']>[0]) {
    return this.#port.setTemporaryOverride(input);
  }

  clearTemporaryOverride(input: Parameters<IAIRoutineCommandPort['clearTemporaryOverride']>[0]) {
    return this.#port.clearTemporaryOverride(input);
  }

  startProtocol(input: Parameters<IAIRoutineCommandPort['startProtocol']>[0]) {
    return this.#port.startProtocol(input);
  }

  transitionProtocol(input: Parameters<IAIRoutineCommandPort['transitionProtocol']>[0]) {
    return this.#port.transitionProtocol(input);
  }
}
