/**
 * Batch Update Key Result Weights Use Case
 *
 * Updates a complete set of key result weights as one aggregate write.
 * Each changed weight gets an audit snapshot in the same transaction.
 */

import { Goal, GoalPolicy, GoalVersionConflictError } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/goal-contracts';
import type { KeyResultId } from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { GoalWriteTransactionRunner } from './goal-write-support';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export interface KeyResultWeightUpdate {
  keyResultId: string;
  weight: number;
}

export class BatchUpdateKeyResultWeightsUseCase {
  constructor(
    private readonly transactionRunner: GoalWriteTransactionRunner,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    expectedVersion: number,
    updates: KeyResultWeightUpdate[],
  ): Promise<Result<GoalMutationReceipt>> {
    return this.transactionRunner.run(async ({ goalRepository }) => {
      const goal = await goalRepository.findByIdForIdentity(identityId, goalId, {
        includeChildren: true,
      });
      if (!goal) {
        return error('NOT_FOUND', `Goal not found: ${goalId}`);
      }
      if (expectedVersion !== goal.version) {
        return error('CONFLICT', 'Goal has been modified by another client');
      }

      this.goalPolicy.ensureGoalCanBeModified(goal);
      const validationError = this.validateUpdates(goal, updates);
      if (validationError) return validationError;

      let hasChanges = false;
      const changedKeyResultIds: KeyResultId[] = [];
      for (const { keyResultId, weight } of updates) {
        const keyResult = goal.getKeyResult(keyResultId)!;
        const oldWeight = keyResult.weight;
        if (oldWeight === weight) continue;

        goal.updateKeyResult(keyResultId, { weight });
        goal.recordWeightSnapshot(
          keyResultId,
          oldWeight,
          weight,
          'Manual',
          identityId,
          'Batch update key result weights',
        );
        changedKeyResultIds.push(keyResult.id);
        hasChanges = true;
      }

      if (hasChanges) {
        goal.advanceVersion();
        try {
          await goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
        } catch (cause) {
          if (cause instanceof GoalVersionConflictError) {
            return error('CONFLICT', cause.message);
          }
          throw cause;
        }
      }

      return ok(createGoalMutationReceipt(goal, { keyResultIds: changedKeyResultIds }));
    });
  }

  private validateUpdates(
    goal: Goal,
    updates: KeyResultWeightUpdate[],
  ): Extract<Result<GoalMutationReceipt>, { ok: false }> | null {
    const keyResultIds = new Set<string>();
    for (const { keyResultId, weight } of updates) {
      if (keyResultIds.has(keyResultId)) {
        return error(
          'VALIDATION_ERROR',
          `KeyResult weight is specified more than once: ${keyResultId}`,
        );
      }
      keyResultIds.add(keyResultId);

      if (!goal.getKeyResult(keyResultId)) {
        return error('NOT_FOUND', `KeyResult not found: ${keyResultId}`);
      }
      Goal.validateKeyResultWeight(weight);
    }
    return null;
  }
}
