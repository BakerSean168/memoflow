import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type { TaskPlanClientDTO } from '@memoflow/task-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { IAISelectedEntityContextReadPort } from '../server/application/ports/selected-entity-context-read.port';
import {
  projectSelectedGoalContext,
  projectSelectedTaskContext,
} from '../server/application/services/selected-entity-owner-projection';

/** Goal/Task owner read capabilities used by the selected-entity projection. */
export interface SelectedEntityContextReadAdapterDeps {
  readonly goals: {
    getGoal(
      id: string,
      identityId: string,
      includeChildren?: boolean,
    ): Promise<Result<GoalClientDTO>>;
  };
  readonly tasks: {
    getTaskPlan(id: string, identityId: string): Promise<Result<TaskPlanClientDTO | null>>;
  };
}

/**
 * Canonical selected-entity projection. It hydrates explicit Goal/Task
 * references from owner application capabilities and intentionally excludes
 * identity/version plumbing.
 */
export function createSelectedEntityContextReadAdapter(
  deps: SelectedEntityContextReadAdapterDeps,
): IAISelectedEntityContextReadPort {
  return {
    async getSelectedEntityContext(input) {
      if (input.entityType === 'goal') {
        const result = await deps.goals.getGoal(input.id, input.identityId, true);
        if (!result.ok) return null;
        return projectSelectedGoalContext(result.data);
      }

      if (input.entityType === 'task') {
        const result = await deps.tasks.getTaskPlan(input.id, input.identityId);
        if (!result.ok || !result.data) return null;
        return projectSelectedTaskContext(result.data);
      }

      return null;
    },
  };
}
