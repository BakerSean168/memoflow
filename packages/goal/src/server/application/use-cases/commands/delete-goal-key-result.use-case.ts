/**
 * Delete Goal Key Result Use Case
 */

import { GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import { GoalPolicy } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class DeleteGoalKeyResultUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    keyResultId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }
    if (expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    this.goalPolicy.ensureGoalCanBeModified(goal);
    const removedKeyResult = goal.removeKeyResult(keyResultId);
    if (!removedKeyResult) {
      return error('NOT_FOUND', `KeyResult not found: ${keyResultId}`);
    }
    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    return ok(createGoalMutationReceipt(goal, { keyResultIds: [removedKeyResult.id] }));
  }
}
