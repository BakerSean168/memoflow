/**
 * Update Goal Key Result Progress Use Case
 */

import { GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import { GoalPolicy } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class UpdateGoalKeyResultProgressUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    keyResultId: string,
    currentValue: number,
    expectedVersion: number,
    note?: string,
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
    goal.updateKeyResultProgress(keyResultId, currentValue, note);
    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    const keyResult = goal.getKeyResult(keyResultId);
    if (!keyResult) {
      return error('NOT_FOUND', `KeyResult not found: ${keyResultId}`);
    }

    return ok(createGoalMutationReceipt(goal, { keyResultIds: [keyResult.id] }));
  }
}
