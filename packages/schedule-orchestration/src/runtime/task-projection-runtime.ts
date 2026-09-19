import type { SchedulingPort } from '@memoflow/contracts/schedule';
import {
  createTaskScheduleProjectionEventHandlers,
  taskScheduleProjectionEventNames,
  type TaskScheduleProjectionEventMap,
  type TaskScheduleProjectionSource,
} from '@memoflow/task/schedule-projection';
import type { Subscriber } from '@memoflow/utils/domain';
import type { RuntimeContribution } from '../ports/runtime-contribution';
import { createTaskProjector } from '../projectors/task-projector';

export interface CreateTaskProjectionRuntimeDeps {
  readonly source: TaskScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
  readonly taskEvents: Subscriber<TaskScheduleProjectionEventMap>;
}

/** Incremental fast path. Durable startup repair is owned by the common repair runtime. */
export function createTaskProjectionRuntime(
  deps: CreateTaskProjectionRuntimeDeps,
): RuntimeContribution {
  const projector = createTaskProjector({
    source: deps.source,
    schedulingPort: deps.schedulingPort,
  });

  const handlers = createTaskScheduleProjectionEventHandlers(projector);
  let started = false;

  const eventNames = taskScheduleProjectionEventNames;

  return {
    async start(): Promise<void> {
      if (started) return;

      for (const eventName of eventNames) {
        deps.taskEvents.on(eventName, handlers[eventName] as never);
      }
      started = true;
    },

    async stop(): Promise<void> {
      if (!started) return;

      for (const eventName of eventNames) {
        deps.taskEvents.off(eventName, handlers[eventName] as never);
      }
      started = false;
    },
  };
}
