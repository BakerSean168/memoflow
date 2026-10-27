import type { GoalApplicationPort } from '@memoflow/goal';
import type { TaskApplicationPort } from '@memoflow/task';
import type { IAISelectedEntityContextReadPort } from '@memoflow/ai';
import { createSelectedEntityContextReadAdapter } from '@memoflow/ai/adapters';

/**
 * API-host binding for the canonical selected-entity projection. Owner
 * application ports are wired here; projection rules live in the AI package.
 */
export class SelectedEntityContextAIReadAdapter implements IAISelectedEntityContextReadPort {
  readonly #port: IAISelectedEntityContextReadPort;

  constructor(goalApplicationPort: GoalApplicationPort, taskApplicationPort: TaskApplicationPort) {
    this.#port = createSelectedEntityContextReadAdapter({
      goals: goalApplicationPort,
      tasks: taskApplicationPort,
    });
  }

  getSelectedEntityContext(
    input: Parameters<IAISelectedEntityContextReadPort['getSelectedEntityContext']>[0],
  ): ReturnType<IAISelectedEntityContextReadPort['getSelectedEntityContext']> {
    return this.#port.getSelectedEntityContext(input);
  }
}
