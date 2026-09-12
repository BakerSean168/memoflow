/**
 * Create Goal Use Case
 *
 * 创建新目标的应用服务
 * 遵循 governance 模块 Result<T> 规范
 */

import type { IGoalRepository } from '../../../domain';
import {
  Goal,
  GoalId,
  GoalLabelOwnershipError,
  GoalPolicy,
  GoalReminderConfig,
  KeyResultId,
} from '../../../domain';
import { IdentityId } from '@memoflow/domain-shared';
import type { CreateGoalReq, GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { createGoalMutationReceipt } from './goal-mutation-receipt';
import { createLogger } from '@memoflow/utils/logger';
import type { GoalWriteTransactionRunner } from './goal-write-support';
/**
 * Create Goal Use Case
 */
export class CreateGoalUseCase {
  private readonly logger = createLogger('CreateGoalUseCase');

  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
    private readonly goalWriteTransactionRunner?: GoalWriteTransactionRunner,
  ) {}

  async execute(input: CreateGoalReq, cx: ExecutionContext): Promise<Result<GoalMutationReceipt>> {
    // 1. 验证输入
    if (!input.name?.trim()) {
      return error('VALIDATION_ERROR', 'Name is required');
    }
    if (!cx.identityId?.trim()) {
      return error('UNAUTHORIZED', 'Identity ID is required');
    }

    // 2. Caller-supplied IDs are the durable idempotency seam used by Mastra
    // workflows and local-first clients. Replaying the same create after a
    // disconnect/restart returns the existing aggregate instead of creating a
    // second business fact.
    if (input.id) {
      const existing = await this.goalRepository.findByIdForIdentity(cx.identityId, input.id, {
        includeChildren: true,
      });
      if (existing) {
        return ok(
          createGoalMutationReceipt(existing, {
            keyResultIds: existing.keyResults.map((keyResult) => keyResult.id),
          }),
        );
      }
    }

    try {
      const goal = Goal.create({
        id: input.id ? GoalId.of(input.id) : undefined,
        identityId: IdentityId.of(cx.identityId),
        name: input.name,
        summary: input.summary ?? null,
        startDate: input.startDate ?? null,
        target: input.target ?? null,
        reminderConfig: input.reminderConfig
          ? GoalReminderConfig.fromDTO(input.reminderConfig)
          : null,
      });

      for (const keyResult of input.initialKeyResults ?? []) {
        goal.createAndAddKeyResult({
          ...keyResult,
          id: keyResult.id ? KeyResultId.of(keyResult.id) : undefined,
          aggregationMethod: keyResult.calculationMethod,
        });
      }

      const persist = async (repository: IGoalRepository): Promise<void> => {
        await repository.save(goal);
        if (input.labelIds !== undefined) {
          const labels = await repository.replaceLabels(
            cx.identityId,
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
      return ok(
        createGoalMutationReceipt(goal, {
          keyResultIds: goal.keyResults.map((keyResult) => keyResult.id),
        }),
      );
    } catch (caughtError) {
      // The concurrent-create window is closed outside the failed transaction:
      // two applies can both pass the pre-check (step 2) before either saves.
      // The slower worker's save then hits the aggregate's unique constraint and
      // would otherwise throw an exception that escapes the Result contract and
      // breaks the durable workflow into `failed`. If the caller supplied a
      // deterministic id and another attempt committed the same aggregate first,
      // surface that durable fact as an idempotent replay.
      if (input.id) {
        try {
          const existing = await this.goalRepository.findByIdForIdentity(cx.identityId, input.id, {
            includeChildren: true,
          });
          if (existing) {
            return ok(
              createGoalMutationReceipt(existing, {
                keyResultIds: existing.keyResults.map((keyResult) => keyResult.id),
              }),
            );
          }
        } catch (replayError) {
          // Preserve the original create error if the replay lookup itself is unavailable.
          this.logger.error('Failed to replay goal during create', { error: replayError });
        }
      }

      this.logger.error('Failed to create goal', { error: caughtError });
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      if (caughtError instanceof GoalLabelOwnershipError) return error(caughtError.code, message);
      return error('INTERNAL_ERROR', message);
    }
  }
}
