import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import {
  GoalPolicy,
  GoalStatus,
  GoalVersionConflictError,
  type IGoalRepository,
} from '../../../domain';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

/** Moves an unarchived Goal into the explicit Planned lifecycle state. */
export class PlanGoalUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren: true,
    });
    if (!goal) return error('NOT_FOUND', `Goal not found: ${id}`);
    if (expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }
    if (goal.archivedAt || goal.deletedAt) {
      return error('INVALID_STATE', 'Archived or deleted goals cannot be planned');
    }

    this.goalPolicy.ensureGoalCanBeModified(goal);
    if (goal.status === GoalStatus.Planned) return ok(createGoalMutationReceipt(goal));

    goal.plan();
    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }
    return ok(createGoalMutationReceipt(goal));
  }
}
