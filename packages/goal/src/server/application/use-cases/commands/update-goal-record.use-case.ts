import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import {
  GoalVersionConflictError,
  KeyResultProgress,
  type IGoalRecordRepository,
  type IGoalRepository,
} from '../../../domain';
import { createGoalMutationReceipt } from './goal-mutation-receipt';
import type { GoalWriteTransactionRunner } from './goal-write-support';

/** Edits a user-owned GoalRecord and recalculates its KR from full authoritative history. */
export class UpdateGoalRecordUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalRecordRepository: IGoalRecordRepository,
    private readonly transactionRunner: GoalWriteTransactionRunner,
  ) {}

  async execute(
    goalId: string,
    keyResultId: string,
    recordId: string,
    params: { value?: number; note?: string | null; expectedVersion: number },
    identityId: string,
  ): Promise<Result<GoalMutationReceipt>> {
    try {
      return await this.transactionRunner.run(async ({ goalRepository, goalRecordRepository }) => {
        const goal = await goalRepository.findByIdForIdentity(identityId, goalId, {
          includeChildren: true,
        });
        if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);
        if (goal.version !== params.expectedVersion) {
          return error('CONFLICT', 'Goal has been modified by another client');
        }

        const record = await goalRecordRepository.findByIdForIdentity(identityId, recordId);
        if (!record || String(record.keyResultId) !== keyResultId) {
          return error('NOT_FOUND', `Goal record not found: ${recordId}`);
        }
        if (!record.canUserCorrect) {
          return error(
            'VALIDATION_ERROR',
            'Automatic Task Goal records are system facts and cannot be edited manually',
          );
        }

        const keyResult = goal.getKeyResult(keyResultId);
        if (!keyResult) return error('NOT_FOUND', `KeyResult not found: ${keyResultId}`);

        if (params.value !== undefined) record.updateValue(params.value);
        if (params.note !== undefined) record.updateNote(params.note);
        await goalRecordRepository.save(record);

        const history = await goalRecordRepository.findByKeyResultId(identityId, keyResultId, {
          orderBy: 'asc',
        });
        const nextValue = KeyResultProgress.fromDTO(keyResult.progress).recalculateFromHistory(
          history.map((item) => item.value),
        ).currentValue;
        if (nextValue !== keyResult.progress.currentValue) {
          goal.updateKeyResultProgress(keyResultId, nextValue);
        }

        goal.advanceVersion();
        await goalRepository.saveRootWithExpectedVersion(goal, params.expectedVersion);

        return ok(
          createGoalMutationReceipt(
            goal,
            { keyResultIds: [keyResult.id], recordIds: [record.id] },
            { upserted: [record.toClientDTO(goalId, nextValue)], removedIds: [] },
          ),
        );
      });
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }
  }
}
