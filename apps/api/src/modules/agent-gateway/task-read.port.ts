import type { createTaskPrismaReadQueries } from '@memoflow/task';
import { GatewayReadError, type TaskReadPort } from '@memoflow/agent-gateway';
import type { Result } from '@memoflow/contracts/result';

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  if (
    result.error.code === 'TIMEOUT' ||
    result.error.code === 'RESPONSE_TOO_LARGE' ||
    result.error.code === 'INVALID_CURSOR'
  )
    throw new GatewayReadError(result.error.code);
  throw new Error('Task owner read failed');
}
/**
 * Binds Task-owned bounded applications without exposing persistence to Gateway.
 * @param queries - Task's explicit plan and occurrence read applications.
 * @returns A concrete transport read seam.
 */
export function bindTaskReadPort(
  queries: ReturnType<typeof createTaskPrismaReadQueries>,
): TaskReadPort {
  return {
    async getTaskPlan(id, context, budget) {
      return unwrap(await queries.getTaskPlan(context.identityId, id, budget));
    },
    async searchTaskPlans(input, context, budget) {
      return unwrap(await queries.searchTaskPlans(context.identityId, input, budget));
    },
    async getTaskOccurrence(id, context, budget) {
      return unwrap(await queries.getTaskOccurrence(context.identityId, id, budget));
    },
    async listTaskOccurrences(input, context, budget) {
      return unwrap(await queries.listTaskOccurrences(context.identityId, input, budget));
    },
  };
}
