/**
 * Archive Goal Use Case
 *
 * 归档目标的应用服务
 * 遵循共享 Result<T> contract
 */

import { GoalPolicy, GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { createGoalMutationReceipt } from './goal-mutation-receipt';
import { type GoalWriteTransactionRunner } from './goal-write-support';

/**
 * Archive Goal Use Case
 */
export class ArchiveGoalUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
    private readonly goalWriteTransactionRunner: GoalWriteTransactionRunner,
  ) {}

  async execute(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${id}`);
    }

    const occurrenceKey = `archived:${id}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'goal',
      occurrenceKey,
    });

    // 终态幂等：已被归档，直接返回既有 receipt，不重复增加 version 或 event
    if (goal.archivedAt) {
      await this.goalWriteTransactionRunner.run((ctx) =>
        ctx.recordGoalCompletionReceipt({
          identityId,
          source: 'goal',
          goalId: id,
          occurrenceKey,
          idempotencyKey,
        }),
      );
      return ok(createGoalMutationReceipt(goal));
    }

    if (expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    this.goalPolicy.ensureGoalCanBeArchived(goal);
    goal.archive();
    goal.advanceVersion();
    try {
      await this.goalWriteTransactionRunner.run(async (ctx) => {
        await ctx.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
        await ctx.recordGoalCompletionReceipt({
          identityId,
          source: 'goal',
          goalId: id,
          occurrenceKey,
          idempotencyKey,
        });
      });
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    return ok(createGoalMutationReceipt(goal));
  }
}
