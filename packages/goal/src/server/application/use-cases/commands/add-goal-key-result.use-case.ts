/**
 * Add Goal Key Result Use Case
 */

import { GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import { GoalPolicy } from '../../../domain';
import type { GoalMutationReceipt, GoalTimeframe } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class AddGoalKeyResultUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    keyResult: {
      title: string;
      aggregationMethod?: import('@memoflow/contracts/goal').KeyResultCalculationMethod;
      initialValue?: number;
      targetValue: number;
      currentValue?: number;
      target?: GoalTimeframe | null;
      unit?: string | null;
      weight?: number;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }
    if (keyResult.expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    this.goalPolicy.ensureGoalCanBeModified(goal);
    const addedKeyResult = goal.createAndAddKeyResult(keyResult);
    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, keyResult.expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    return ok(
      createGoalMutationReceipt(goal, {
        keyResultIds: [addedKeyResult.id],
      }),
    );
  }
}
