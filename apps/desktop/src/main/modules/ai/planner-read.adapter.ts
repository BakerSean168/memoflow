import type { IAIPlannerReadPort } from '@memoflow/ai';
import { createPlannerReadAdapter, type PlannerReadAdapterDeps } from '@memoflow/ai/adapters';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import { derivePlannerConflicts } from '@memoflow/schedule-client';
import type { TaskApplicationPort } from '@memoflow/task';
import type { UserTimeContextPort } from '@memoflow/time';

/**
 * Desktop-host binding for the canonical `@memoflow/ai/adapters` Planner factory.
 * Only owner dependencies are wired here; behaviour lives in the AI package.
 */
export class DesktopPlannerAIReadAdapter implements IAIPlannerReadPort {
  readonly #port: IAIPlannerReadPort;

  constructor(
    scheduleEventApi: ScheduleEventApplicationPort,
    taskApplicationPort: TaskApplicationPort,
    userTimeContextPort: UserTimeContextPort,
  ) {
    const deps: PlannerReadAdapterDeps = {
      scheduleEvents: scheduleEventApi,
      tasks: taskApplicationPort,
      userTime: userTimeContextPort,
      deriveConflicts: derivePlannerConflicts,
    };
    this.#port = createPlannerReadAdapter(deps);
  }

  getWindowSummary(input: Parameters<IAIPlannerReadPort['getWindowSummary']>[0]) {
    return this.#port.getWindowSummary(input);
  }

  getConflicts(input: Parameters<IAIPlannerReadPort['getConflicts']>[0]) {
    return this.#port.getConflicts(input);
  }

  getUpcomingTasks(input: Parameters<IAIPlannerReadPort['getUpcomingTasks']>[0]) {
    return this.#port.getUpcomingTasks(input);
  }
}
