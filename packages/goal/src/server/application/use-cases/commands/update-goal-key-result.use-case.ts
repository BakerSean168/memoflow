/**
 * Update Goal Key Result Use Case
 */

import { GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import { GoalPolicy } from '../../../domain';
import type { GoalMutationReceipt, GoalTimeframe } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class UpdateGoalKeyResultUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    keyResultId: string,
    updates: {
      title?: string;
      description?: string;
      weight?: number;
      initialValue?: number;
      target?: GoalTimeframe | null;
      aggregationMethod?: import('@memoflow/contracts/goal').KeyResultCalculationMethod;
      currentValue?: number;
      targetValue?: number;
      unit?: string;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }
    if (updates.expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    this.goalPolicy.ensureGoalCanBeModified(goal);
    const keyResult = goal.keyResults.find((kr) => kr.id === keyResultId);
    if (!keyResult) {
      return error('NOT_FOUND', `KeyResult not found: ${keyResultId}`);
    }

    goal.updateKeyResult(keyResultId, {
      title: updates.title,
      description: updates.description,
      weight: updates.weight,
      initialValue: updates.initialValue,
      target: updates.target,
      aggregationMethod: updates.aggregationMethod,
      currentValue: updates.currentValue,
      targetValue: updates.targetValue,
      unit: updates.unit,
    });

    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, updates.expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    return ok(createGoalMutationReceipt(goal, { keyResultIds: [keyResult.id] }));
  }
}
