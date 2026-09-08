import type { PrismaClient } from '@memoflow/database';
import {
  GoalTaskBindingQueryInputSchema,
  type GoalDependencyReadPort,
  type GoalTaskBindingQueryInput,
} from '@memoflow/contracts/reliable-messaging';

export class PrismaTaskBindingReadPort implements GoalDependencyReadPort {
  constructor(private readonly db: PrismaClient) {}

  async checkActiveTaskBindings(input: GoalTaskBindingQueryInput): Promise<{
    hasActiveBindings: boolean;
    activeCount: number;
  }> {
    const validated = GoalTaskBindingQueryInputSchema.parse(input);
    const count = await this.db.taskPlan.count({
      where: {
        identityId: validated.identityId,
        goalId: validated.goalId,
        deletedAt: null,
      },
    });
    return {
      hasActiveBindings: count > 0,
      activeCount: count,
    };
  }
}
