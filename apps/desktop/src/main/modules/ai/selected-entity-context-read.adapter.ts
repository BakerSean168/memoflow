import type { GoalApplicationPort } from '@memoflow/goal';
import type { TaskApplicationPort } from '@memoflow/task';
import {
  projectSelectedGoalContext,
  projectSelectedTaskContext,
  type IAISelectedEntityContextReadPort,
} from '@memoflow/ai';

/** Desktop lane equivalent of the API selected-entity owner projection. */
export class DesktopSelectedEntityContextReadAdapter implements IAISelectedEntityContextReadPort {
  constructor(
    private readonly goalApplicationPort: GoalApplicationPort,
    private readonly taskApplicationPort: TaskApplicationPort,
  ) {}

  async getSelectedEntityContext(
    input: Parameters<IAISelectedEntityContextReadPort['getSelectedEntityContext']>[0],
  ): ReturnType<IAISelectedEntityContextReadPort['getSelectedEntityContext']> {
    if (input.entityType === 'goal') {
      const result = await this.goalApplicationPort.getGoal(input.id, input.identityId, true);
      if (!result.ok) return null;
      return projectSelectedGoalContext(result.data);
    }

    if (input.entityType === 'task') {
      const result = await this.taskApplicationPort.getTaskPlan(input.id, input.identityId);
      if (!result.ok || !result.data) return null;
      return projectSelectedTaskContext(result.data);
    }

    return null;
  }
}
