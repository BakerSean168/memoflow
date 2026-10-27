import {
  routineScheduleProjectionEventNames,
  type RoutineScheduleProjectionEventMap,
} from '@memoflow/routine-contracts';
import type { SchedulingPort } from '@memoflow/schedule-contracts';
import {
  createRoutineScheduleProjectionEventHandlers,
  type RoutineScheduleProjectionSource,
} from '@memoflow/routine/schedule-projection/routine';
import type { Subscriber } from '@memoflow/utils/domain';
import type { RuntimeContribution } from '../ports/runtime-contribution';
import { createRoutineProjector } from '../projectors/routine-projector';

export interface CreateRoutineProjectionRuntimeDeps {
  readonly source: RoutineScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
  readonly routineEvents: Subscriber<RoutineScheduleProjectionEventMap>;
}

/** Incremental fast path. Durable startup repair is owned by the common repair runtime. */
export function createRoutineProjectionRuntime(
  deps: CreateRoutineProjectionRuntimeDeps,
): RuntimeContribution {
  const projector = createRoutineProjector({
    source: deps.source,
    schedulingPort: deps.schedulingPort,
  });

  const handlers = createRoutineScheduleProjectionEventHandlers(projector);
  let started = false;

  return {
    async start(): Promise<void> {
      if (started) return;

      for (const name of routineScheduleProjectionEventNames) {
        deps.routineEvents.on(
          name,
          handlers[name] as (event: RoutineScheduleProjectionEventMap[typeof name]) => void,
        );
      }
      started = true;
    },

    async stop(): Promise<void> {
      if (!started) return;

      for (const name of routineScheduleProjectionEventNames) {
        deps.routineEvents.off(
          name,
          handlers[name] as (event: RoutineScheduleProjectionEventMap[typeof name]) => void,
        );
      }
      started = false;
    },
  };
}
