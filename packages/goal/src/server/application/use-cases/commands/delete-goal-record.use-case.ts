/**
 * Delete Goal Record Use Case
 *
 * 删除记录与重新计算 KR 进度属于同一个 Goal 写事务。
 */

import {
  GoalVersionConflictError,
  KeyResultProgress,
  type IGoalRecordRepository,
  type IGoalRepository,
} from '../../../domain';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import { type GoalWriteTransactionRunner } from './goal-write-support';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class DeleteGoalRecordUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalRecordRepository: IGoalRecordRepository,
    private readonly transactionRunner: GoalWriteTransactionRunner,
  ) {}

  async execute(
    goalId: string,
    keyResultId: string,
    recordId: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    try {
      return await this.transactionRunner.run(async ({ goalRepository, goalRecordRepository }) => {
        const goal = await goalRepository.findByIdForIdentity(identityId, goalId, {
          includeChildren: true,
        });
        if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);
        if (goal.version !== expectedVersion) {
          return error('CONFLICT', 'Goal has been modified by another client');
        }

        const record = await goalRecordRepository.findByIdForIdentity(identityId, recordId);
        if (!record || String(record.keyResultId) !== keyResultId) {
          return error('NOT_FOUND', `Goal record not found: ${recordId}`);
        }

        if (!record.canUserDelete) {
          return error('VALIDATION_ERROR', 'Task Goal records must be removed through Task correction or revert');
        }

        const keyResult = goal.keyResults.find((item) => item.id === keyResultId);
        if (!keyResult) {
          return error('NOT_FOUND', `KeyResult not found: ${keyResultId} in goal ${goalId}`);
        }

        const historyBefore = await goalRecordRepository.findByKeyResultId(
          identityId,
          keyResultId,
          { orderBy: 'asc' },
        );
        const historyAfter = historyBefore.filter((item) => item.id !== recordId);
        const currentProgress = KeyResultProgress.fromDTO(keyResult.progress);
        const nextValue = currentProgress.recalculateFromHistory(
          historyAfter.map((item) => item.value),
        ).currentValue;

        await goalRecordRepository.delete(identityId, recordId);
        if (nextValue !== currentProgress.currentValue) {
          goal.updateKeyResultProgress(keyResultId, nextValue);
        }
        goal.advanceVersion();
        await goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);

        return ok(
          createGoalMutationReceipt(
            goal,
            {
              keyResultIds: [keyResult.id],
              recordIds: [record.id],
            },
            { upserted: [], removedIds: [record.id] },
          ),
        );
      });
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) {
        return error('CONFLICT', cause.message);
      }
      throw cause;
    }
  }
}
