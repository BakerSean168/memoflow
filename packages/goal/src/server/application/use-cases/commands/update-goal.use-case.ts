/**
 * Update Goal Use Case
 *
 * 更新目标基本信息的应用服务
 * 遵循 governance 模块 Result<T> 规范
 */

import {
  GoalLabelOwnershipError,
  GoalVersionConflictError,
  type IGoalRepository,
} from '../../../domain';
import { GoalPolicy } from '../../../domain';
import type { UpdateGoalReq, UpdateGoalRes } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';
import type { GoalWriteTransactionRunner } from './goal-write-support';

/**
 * Update Goal Use Case
 */
export class UpdateGoalUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
    private readonly goalWriteTransactionRunner?: GoalWriteTransactionRunner,
  ) {}

  async execute(
    id: string,
    identityId: string,
    input: UpdateGoalReq,
  ): Promise<Result<UpdateGoalRes>> {
    // 1. 查询目标（身份隔离）
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${id}`);
    }
    if (input.expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    const existingKeyResultIds = new Set(
      goal.getAllKeyResults().map((keyResult) => String(keyResult.id)),
    );
    const desiredKeyResultIds = new Set<string>();
    if (input.keyResults !== undefined) {
      for (const keyResult of input.keyResults) {
        if (!keyResult.id) continue;
        const id = String(keyResult.id);
        if (!existingKeyResultIds.has(id)) {
          return error('VALIDATION_ERROR', `Key result does not belong to goal: ${id}`);
        }
        if (desiredKeyResultIds.has(id)) {
          return error('VALIDATION_ERROR', `Duplicate key result: ${id}`);
        }
        desiredKeyResultIds.add(id);
      }
    }

    // 2. 领域策略校验
    this.goalPolicy.ensureGoalCanBeModified(goal);

    // 3. Update canonical Direction fields.
    goal.updateBasicInfo({
      name: input.name,
      summary: input.summary,
    });

    // 4. Update calendar-native planning time without inventing a deadline.
    if (input.startDate !== undefined || input.target !== undefined) {
      goal.updatePlanningTime({
        startDate: input.startDate !== undefined ? (input.startDate ?? null) : undefined,
        target: input.target !== undefined ? (input.target ?? null) : undefined,
      });
    }

    // 7. 更新提醒配置
    if (input.reminderConfig !== undefined) {
      goal.updateReminderConfig(input.reminderConfig ?? null);
    }

    // 8. Reconcile child entities in memory and persist the aggregate once. This makes
    // root and KR edits one optimistic-lock transaction instead of a sequence of writes.
    if (input.keyResults !== undefined) {
      for (const keyResult of input.keyResults) {
        if (keyResult.id) {
          const id = String(keyResult.id);
          goal.updateKeyResult(id, {
            title: keyResult.title,
            description: keyResult.description,
            aggregationMethod: keyResult.calculationMethod,
            initialValue: keyResult.initialValue,
            currentValue: keyResult.currentValue,
            targetValue: keyResult.targetValue,
            target: keyResult.target ?? null,
            unit: keyResult.unit ?? null,
            weight: keyResult.weight,
          });
          continue;
        }

        goal.createAndAddKeyResult({
          title: keyResult.title,
          description: keyResult.description,
          aggregationMethod: keyResult.calculationMethod,
          initialValue: keyResult.initialValue,
          currentValue: keyResult.currentValue,
          targetValue: keyResult.targetValue,
          target: keyResult.target ?? null,
          unit: keyResult.unit,
          weight: keyResult.weight,
        });
      }

      for (const existingId of existingKeyResultIds) {
        if (!desiredKeyResultIds.has(existingId)) goal.removeKeyResult(existingId);
      }

      goal.reorderKeyResults(goal.getAllKeyResults().map((keyResult) => String(keyResult.id)));
    }

    // 9. 持久化
    goal.advanceVersion();
    try {
      const persist = async (repository: IGoalRepository): Promise<void> => {
        await repository.saveRootWithExpectedVersion(goal, input.expectedVersion);
        if (input.labelIds !== undefined) {
          const labels = await repository.replaceLabels(
            identityId,
            String(goal.id),
            input.labelIds,
          );
          goal.hydrateLabels(labels);
        }
      };
      if (this.goalWriteTransactionRunner) {
        await this.goalWriteTransactionRunner.run((ctx) => persist(ctx.goalRepository));
      } else {
        await persist(this.goalRepository);
      }
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) {
        return error('CONFLICT', cause.message);
      }
      if (cause instanceof GoalLabelOwnershipError) return error(cause.code, cause.message);
      throw cause;
    }

    // 10. 返回 Result
    return ok(createGoalMutationReceipt(goal));
  }
}
