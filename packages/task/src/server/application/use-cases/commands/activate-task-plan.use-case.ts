/**
 * Activate Task Template Use Case
 *
 * Business flow:
 * 1. Mark the template as active.
 * 2. Generate the next task instances immediately.
 * 3. Persist both template state and generated instances in one write boundary.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskOccurrenceGenerationService } from '../../../domain/services/index';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
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
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to ActivateTaskPlanUseCase');
    }
    this.generationService = new TaskOccurrenceGenerationService();
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
  ): Promise<Result<{ template: TaskPlanClientDTO; instancesGenerated: number }>> {
    try {
      return await this.transactionRunner.run(async ({ templateRepository, instanceRepository }) => {
        const template = await templateRepository!.findByIdForIdentity(identityId, id);
        if (!template) {
          return error('NOT_FOUND', `TaskPlan ${id} not found`);
        }

        template.activate();

        // Rehydrate existing facts so recurrence filtering is domain-correct, then
        // refill from the activation point. Pause intentionally may retain the old
        // generation horizon after deleting future incomplete occurrences.
        const existingInstances = await instanceRepository.findByTemplateId(id, identityId);
        existingInstances.forEach((instance) => template.addInstance(instance));
        const instances = this.generationService.generateInstances(template, {
          forceGenerate: true,
          fromDate: Date.now(),
        });
        let instancesGenerated = 0;

        if (instances.length > 0) {
          await instanceRepository.saveMany(instances);
          instancesGenerated = instances.length;
        }

        await templateRepository!.save(template);

        return ok({
          template: template.toClientDTO(),
          instancesGenerated,
        });
      });
    } catch (caughtError) {
      this.logger.error('Failed to activate task template', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to activate task template'),
      );
    }
  }
}
