/**
 * Get Task Template Service
 *
 * 鑾峰彇浠诲鑾峰彇浠诲姟妯℃澘璇︽儏
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskOccurrenceStatus } from '../../../domain/value-objects';
import type { GetTaskPlanRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

/**
 * Get Task Template Service
 */
export class GetTaskPlanUseCase {
  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    id: string,
    identityId: string,
    includeChildren = false,
  ): Promise<Result<GetTaskPlanRes>> {
    const template = includeChildren
      ? await this.templateRepository.findByIdWithChildren(identityId, id)
      : await this.templateRepository.findByIdForIdentity(identityId, id);

    if (!template) {
      return ok(null);
    }

    const asOf = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const windowStart = Number(
      taskTime.calendar.startOfDay(taskTime.calendar.addDays(asOf, -29)),
    );
    const dto = template.toClientDTOAt(timeContext, includeChildren, asOf);

    if (!includeChildren) {
      let stats = (
        (await this.instanceRepository.getTemplateStats([id], identityId, { windowStart, asOf })) ?? {}
      )[id];

      if (!stats) {
        const instances = (await this.instanceRepository.findByTemplateId(id, identityId)) ?? [];
        const completionWindowDays = 30 as const;
        const completedInstanceCount = instances.filter(
          (instance) => instance.status === TaskOccurrenceStatus.Completed,
        ).length;
        const pendingInstanceCount = instances.filter(
          (instance) => instance.status === TaskOccurrenceStatus.Pending,
        ).length;
        const instanceCount = instances.length;
        const dueInstances = instances.filter(
          (instance) => instance.instanceDate >= windowStart && instance.instanceDate <= asOf,
        );
        const completedDueInstanceCount = dueInstances.filter(
          (instance) => instance.status === TaskOccurrenceStatus.Completed,
        ).length;

        stats = {
          templateId: id,
          instanceCount,
          completedInstanceCount,
          pendingInstanceCount,
          dueInstanceCount: dueInstances.length,
          completedDueInstanceCount,
          completionWindowDays,
          futurePendingInstanceCount: instances.filter(
            (instance) =>
              instance.status === TaskOccurrenceStatus.Pending && instance.instanceDate > asOf,
          ).length,
          singleInstanceStatus: instances.length === 1 ? instances[0].status : null,
          completionRate:
            dueInstances.length > 0
              ? Math.round((completedDueInstanceCount / dueInstances.length) * 100)
              : 0,
        };
      }

      dto.instanceCount = stats?.instanceCount ?? 0;
      dto.completedInstanceCount = stats?.completedInstanceCount ?? 0;
      dto.pendingInstanceCount = stats?.pendingInstanceCount ?? 0;
      dto.dueInstanceCount = stats?.dueInstanceCount ?? 0;
      dto.completedDueInstanceCount = stats?.completedDueInstanceCount ?? 0;
      dto.completionWindowDays = stats?.completionWindowDays ?? 30;
      dto.futurePendingInstanceCount = stats?.futurePendingInstanceCount ?? 0;
      dto.singleInstanceStatus = stats?.singleInstanceStatus ?? null;
      dto.completionRate = stats?.completionRate ?? 0;
    }

    return ok(dto);
  }
}
