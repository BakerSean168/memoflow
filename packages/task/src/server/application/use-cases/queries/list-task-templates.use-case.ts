/**
 * List Task Templates Service
 *
 * Retrieves task templates by account, automatically checking
 * and replenishing instances for active templates.
 */

import type { ITaskTemplateRepository } from '../../../domain/repositories/i-task-template-repository';
import type { ITaskInstanceRepository } from '../../../domain/repositories/i-task-instance-repository';
import type { TaskTemplate } from '../../../domain/aggregates/task-template';
import type {
  QueryTaskTemplatesInternal,
  QueryTaskTemplatesRes,
  TaskTemplateStatus as TaskTemplateStatusType,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

/**
 * List Task Templates Service
 */
export class ListTaskTemplatesUseCase {
  constructor(
    private readonly templateRepository: ITaskTemplateRepository,
    private readonly instanceRepository: ITaskInstanceRepository,
  ) {}

  async execute(request: QueryTaskTemplatesInternal): Promise<Result<QueryTaskTemplatesRes>> {
    let templates: TaskTemplate[];

    // Shared Label filtering is repository-owned AND semantics. Other legacy filters
    // can further narrow the already identity-scoped result without inventing a
    // second Label filtering engine in the application layer.
    if (request.labelIdsAll && request.labelIdsAll.length > 0) {
      templates = await this.templateRepository.findByLabelIdsAll(
        request.identityId,
        request.labelIdsAll,
      );
      if (request.status && request.status.length > 0) {
        templates = templates.filter((template) =>
          request.status!.includes(String(template.status)),
        );
      }
      if (request.goalId) {
        templates = templates.filter(
          (template) => String(template.goalBinding?.goalId ?? '') === String(request.goalId),
        );
      }
    } else if (request.status && request.status.length > 0) {
      templates = await this.templateRepository.findByStatus(
        request.identityId,
        request.status[0] as TaskTemplateStatusType,
      );
    } else if (request.goalId) {
      templates = await this.templateRepository.findByGoalId(request.identityId, request.goalId);
    } else {
      templates = await this.templateRepository.findByIdentityId(request.identityId);
    }

    // R2-3：列表查询保持纯读——实例补充由显式 maintenance worker 负责
    // （task-instance-maintenance-runtime），不再在查询路径写库。
    const statsByTemplateId =
      (await this.instanceRepository.getTemplateStats(
        templates.map((template) => template.id),
        request.identityId,
      )) ?? {};

    return ok({
      templates: templates.map((template) => {
        const dto = template.toClientDTO();
        const stats = statsByTemplateId[template.id];

        if (!stats) {
          return dto;
        }

        return {
          ...dto,
          instanceCount: stats.instanceCount,
          completedInstanceCount: stats.completedInstanceCount,
          pendingInstanceCount: stats.pendingInstanceCount,
          dueInstanceCount: stats.dueInstanceCount,
          completedDueInstanceCount: stats.completedDueInstanceCount,
          completionWindowDays: stats.completionWindowDays,
          futurePendingInstanceCount: stats.futurePendingInstanceCount,
          singleInstanceStatus: stats.singleInstanceStatus,
          completionRate: stats.completionRate,
        };
      }),
      total: templates.length,
    });
  }
}
