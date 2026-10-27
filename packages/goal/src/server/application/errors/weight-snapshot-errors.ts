/**
 * Application Layer Errors for Weight Snapshot
 * 权重快照应用层错误
 */

import { ResultErrorException } from '@memoflow/transport-contracts/result';

/**
 * Goal 未找到错误
 */
export class GoalNotFoundError extends ResultErrorException {
  constructor(goalId: string) {
    super(`Goal not found: ${goalId}`, 'GOAL_NOT_FOUND', undefined, { goalId }, 404);
  }
}

/**
 * KeyResult 未找到错误
 */
export class KeyResultNotFoundError extends ResultErrorException {
  constructor(krId: string, goalId?: string) {
    const message = goalId
      ? `KeyResult not found in Goal ${goalId}: ${krId}`
      : `KeyResult not found: ${krId}`;
    super(message, 'KEY_RESULT_NOT_FOUND', undefined, { krId, goalId }, 404);
  }
}
