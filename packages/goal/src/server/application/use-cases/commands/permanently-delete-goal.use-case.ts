/**
 * Permanently Delete Goal Use Case
 *
 * 永久删除目标的应用服务。
 * 只有已归档的目标才能被永久删除。
 * 永久删除是不可逆操作，会级联删除所有子实体。
 */

import { GoalPolicy, GoalVersionConflictError } from '../../../domain';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { GoalDeletionTransactionRunner } from './goal-deletion-support';

/**
 * PermanentlyDeleteGoalUseCase
 *
 * 前置条件：
 * - 目标必须已归档（archivedAt !== null）
 *
 * 执行结果：
 * - 物理删除目标及其所有子实体（KeyResult, GoalReview, WeightSnapshot）
 */
export class PermanentlyDeleteGoalUseCase {
  constructor(
    private readonly goalPolicy: GoalPolicy,
    private readonly deletionTransactionRunner: GoalDeletionTransactionRunner,
  ) {}

  /**
   * 永久删除已归档的目标
   *
   * @param id - 目标 ID
   * @returns 成功返回被删除的目标 ID
   */
  async execute(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<{ id: string }>> {
    try {
      return await this.deletionTransactionRunner.run(
        async ({ goalRepository, relationCleanup }) => {
          const goal = await goalRepository.findByIdForIdentity(identityId, id, {
            includeChildren: true,
          });
          if (!goal) return error('NOT_FOUND', `Goal not found: ${id}`);
          if (goal.version !== expectedVersion) {
            return error('CONFLICT', 'Goal has been modified by another client');
          }

          this.goalPolicy.ensureGoalCanBePermanentlyDeleted(goal);
          await goalRepository.deleteWithExpectedVersion(identityId, id, expectedVersion);
          await relationCleanup.unlinkAllForGoal(identityId, id);
          return ok({ id });
        },
      );
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }
  }
}
