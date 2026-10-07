import type { createGoalPrismaPageQuery } from '@memoflow/goal';
import { GatewayReadError, type GoalReadPort } from '@memoflow/agent-gateway';

/**
 * Adapts existing owner applications without granting the Gateway persistence access.
 * @param pages - Goal's database-bounded hosted query application.
 * @returns The concrete Goal read port consumed by the Gateway.
 */
export function bindGoalReadPort(
  pages: ReturnType<typeof createGoalPrismaPageQuery>,
): GoalReadPort {
  return {
    async getGoal(id, context, budget) {
      const result = await pages.getGoal(context.identityId, id, budget);
      if (result.ok) return result.data;
      if (result.error.code === 'NOT_FOUND') return null;
      if (result.error.code === 'TIMEOUT' || result.error.code === 'RESPONSE_TOO_LARGE')
        throw new GatewayReadError(result.error.code);
      throw new Error('Goal read failed');
    },
    async searchGoalPage(input, context, budget) {
      const result = await pages.searchGoalPage(context.identityId, input, budget);
      if (!result.ok) {
        if (result.error.code === 'TIMEOUT' || result.error.code === 'RESPONSE_TOO_LARGE')
          throw new GatewayReadError(result.error.code);
        throw new Error('Goal page read failed');
      }
      return result.data;
    },
  };
}
