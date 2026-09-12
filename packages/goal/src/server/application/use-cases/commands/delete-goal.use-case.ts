/**
 * Delete Goal Use Case
 *
 * 删除目标（软删除）的应用服务
 */

import { GoalPolicy, GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { GoalDeletionTransactionRunner } from './goal-deletion-support';

/**
 * Delete Goal Use Case
 *
 * 实际执行的是软删除操作，目标进入"已删除"视图。
 */
export class DeleteGoalUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
    private readonly taskBindingReadPort: GoalDependencyReadPort,
    private readonly deletionTransactionRunner: GoalDeletionTransactionRunner,
  ) {
    if (!taskBindingReadPort) {
      throw new Error('ITaskBindingReadPort must be explicitly provided to DeleteGoalUseCase');
    }
    if (!deletionTransactionRunner) {
      throw new Error(
        'GoalDeletionTransactionRunner must be explicitly provided to DeleteGoalUseCase',
      );
    }
  }

  /**
   * 检查目标依赖项
   */
  async checkDependencies(
    id: string,
    identityId: string,
  ): Promise<
    Result<{
      hasKeyResults: boolean;
      keyResultCount: number;
      hasReviews: boolean;
      reviewCount: number;
      hasTaskLinks: boolean;
      taskBindingCount: number;
      canDelete: boolean;
      warnings: string[];
    }>
  > {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${id}`);
    }

    const keyResults = goal.keyResults || [];
    const goalReviews = goal.goalReviews || [];
    const keyResultCount = keyResults.length;
    const reviewCount = goalReviews.length;

    const bindingCheck = await this.taskBindingReadPort.checkActiveTaskBindings({
      identityId,
      goalId: id,
    });
    const taskBindingCount = bindingCheck.activeCount;

    const warnings: string[] = [];

    if (keyResultCount > 0) {
      warnings.push(`该目标包含 ${keyResultCount} 个关键结果`);
    }

    if (reviewCount > 0) {
      warnings.push(`该目标包含 ${reviewCount} 条复盘记录`);
    }

    if (taskBindingCount > 0) {
      warnings.push(`该目标包含 ${taskBindingCount} 个关联任务`);
    }

    return ok({
      hasKeyResults: keyResultCount > 0,
      keyResultCount,
      hasReviews: reviewCount > 0,
      reviewCount,
      hasTaskLinks: taskBindingCount > 0,
      taskBindingCount,
      canDelete: taskBindingCount === 0,
      warnings,
    });
  }

  /**
   * 执行软删除
   */
  async execute(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    try {
      return await this.deletionTransactionRunner.run(
        async ({ goalRepository, relationCleanup }) => {
          const goal = await goalRepository.findByIdForIdentity(identityId, id, {
            includeChildren: true,
          });
          if (!goal) return error('NOT_FOUND', `Goal not found: ${id}`);
          if (expectedVersion !== goal.version) {
            return error('CONFLICT', 'Goal has been modified by another client');
          }

          const bindingCheck = await this.taskBindingReadPort.checkActiveTaskBindings({
            identityId,
            goalId: id,
          });
          if (bindingCheck.activeCount > 0) {
            return error(
              'CONFLICT',
              `Goal has ${bindingCheck.activeCount} active task binding(s); delete rejected`,
            );
          }

          goal.softDelete();
          goal.advanceVersion();
          await goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
          await relationCleanup.unlinkAllForGoal(identityId, id);
          return ok(createGoalMutationReceipt(goal));
        },
      );
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }
  }
}
