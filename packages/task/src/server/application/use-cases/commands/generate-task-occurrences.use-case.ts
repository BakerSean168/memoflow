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
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to GenerateTaskOccurrencesUseCase');
    }
    this.generationService = new TaskOccurrenceGenerationService();
    this.transactionRunner = transactionRunner;
  }

  async execute(
    templateId: string,
    identityId: string,
    request: { fromDate: number; toDate: number },
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(async ({ templateRepository, instanceRepository }) => {
        const template = await templateRepository!.findByIdForIdentity(identityId, templateId);
        if (!template) {
          return error('NOT_FOUND', `TaskPlan ${templateId} not found`);
        }

        const existingInstances = await instanceRepository.findByTemplateId(templateId, identityId);
        existingInstances.forEach((instance) => template.addInstance(instance));

        const instances = this.generationService.generateInstances(template, timeContext, {
          forceGenerate: true,
          targetDate: request.toDate,
          // R2-2：force 路径不再忽略请求区间——从 fromDate 生成到 toDate。
          fromDate: request.fromDate,
        });

        if (instances.length > 0) {
          await instanceRepository.saveMany(instances);
          await templateRepository!.save(template);
        }

        return ok(instances.map((instance) => instance.toClientDTOAt(timeContext)));
      });
    } catch (caughtError) {
      this.logger.error('Failed to generate task instances', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to generate task instances'),
      );
    }
  }
}
