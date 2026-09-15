/**
 * Generate Task Instances
 *
 * 为指定模板生成任务实例
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskOccurrenceGenerationService } from '../../../domain/services/index';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

export class GenerateTaskOccurrencesUseCase {
  private readonly generationService: TaskOccurrenceGenerationService;
  private readonly logger = createLogger('GenerateTaskOccurrencesUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to GenerateTaskOccurrencesUseCase',
      );
    }
    this.generationService = new TaskOccurrenceGenerationService();
    this.transactionRunner = transactionRunner;
  }

  async execute(
    planId: string,
    identityId: string,
    request: { fromDate: number; toDate: number },
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(
        async ({ planRepository, occurrenceRepository }) => {
          const plan = await planRepository!.findByIdForIdentity(identityId, planId);
          if (!plan) {
            return error('NOT_FOUND', `TaskPlan ${planId} not found`);
          }

          const existingOccurrences = await occurrenceRepository.findByPlanId(
            planId,
            identityId,
          );
          const occurrences = this.generationService.generateOccurrences(plan, timeContext, {
            targetDate: request.toDate,
            // R2-2：force 路径不再忽略请求区间——从 fromDate 生成到 toDate。
            fromDate: request.fromDate,
            existingOccurrences,
          });

          if (occurrences.length > 0) {
            await occurrenceRepository.saveMany(occurrences);
            await planRepository!.save(plan);
          }

          return ok(occurrences.map((occurrence) => occurrence.toClientDTOAt(timeContext)));
        },
      );
    } catch (caughtError) {
      this.logger.error('Failed to generate task occurrences', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to generate task occurrences'));
    }
  }
}
