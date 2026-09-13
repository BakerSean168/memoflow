/**
 * Activate Task Template Use Case
 *
 * Business flow:
 * 1. Mark the plan as active.
 * 2. Generate the next task occurrences immediately.
 * 3. Persist both plan state and generated occurrences in one write boundary.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskOccurrenceGenerationService } from '../../../domain/services/index';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

/**
 * Activate Task Template Use Case
 */
export class ActivateTaskPlanUseCase {
  private readonly generationService: TaskOccurrenceGenerationService;
  private readonly logger = createLogger('ActivateTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to ActivateTaskPlanUseCase',
      );
    }
    this.generationService = new TaskOccurrenceGenerationService();
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
  ): Promise<Result<{ plan: TaskPlanClientDTO; occurrencesGenerated: number }>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(
        async ({ planRepository, occurrenceRepository }) => {
          const plan = await planRepository!.findByIdForIdentity(identityId, id);
          if (!plan) {
            return error('NOT_FOUND', `TaskPlan ${id} not found`);
          }

          plan.activate();

          // Existing occurrences are independent facts; pass them explicitly to materialization.
          const existingOccurrences = await occurrenceRepository.findByPlanId(id, identityId);
          const occurrences = this.generationService.generateOccurrences(plan, timeContext, {
            fromDate: Date.now(),
            existingOccurrences,
          });
          let occurrencesGenerated = 0;

          if (occurrences.length > 0) {
            await occurrenceRepository.saveMany(occurrences);
            occurrencesGenerated = occurrences.length;
          }

          await planRepository!.save(plan);

          return ok({
            plan: plan.toClientDTOAt(timeContext),
            occurrencesGenerated,
          });
        },
      );
    } catch (caughtError) {
      this.logger.error('Failed to activate task plan', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to activate task plan'));
    }
  }
}
