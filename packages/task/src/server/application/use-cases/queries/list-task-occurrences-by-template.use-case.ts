/**
 * List Task Instances By Template Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

export class ListTaskOccurrencesByTemplateUseCase {
  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly templateRepository: ITaskPlanRepository,
  ) {}

  async execute(
    templateId: string,
    identityId: string,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const template = await this.templateRepository.findByIdForIdentity(identityId, templateId);
    if (!template) {
      return ok([]);
    }

    const instances = await this.instanceRepository.findByTemplateId(templateId, identityId);
    return ok(instances.map((i) => i.toClientDTO()));
  }
}
