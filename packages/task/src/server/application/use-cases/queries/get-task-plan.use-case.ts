/**
 * Get Task Plan Service
 *
 * TaskPlan is loaded as one aggregate. Occurrence children/statistics are composed
 * explicitly from the TaskOccurrence owner instead of being hydrated into TaskPlan.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type {
  ITaskOccurrenceRepository,
  TaskPlanInstanceStats,
} from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskOccurrenceStatus } from '../../../domain/value-objects';
import type { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import type { GetTaskPlanRes } from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

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
    const template = await this.templateRepository.findByIdForIdentity(identityId, id);
    if (!template) {
      return ok(null);
    }

    const asOf = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const windowStart = taskTime.calendar.toYmd(taskTime.calendar.addDays(asOf, -29));
    const asOfDate = taskTime.calendar.toYmd(asOf);
    const dto = template.toClientDTOAt(timeContext, includeChildren, asOf);

    let occurrences: TaskOccurrence[] | null = null;
    const loadOccurrences = async (): Promise<TaskOccurrence[]> => {
      if (occurrences === null) {
        occurrences = (await this.instanceRepository.findByTemplateId(id, identityId)) ?? [];
      }
      return occurrences;
    };

    let stats: TaskPlanInstanceStats | undefined = ((await this.instanceRepository.getTemplateStats(
      [id],
      identityId,
      { windowStart, asOf: asOfDate },
    )) ?? {})[id];

    if (!stats) {
      stats = this.calculateStats(id, await loadOccurrences(), windowStart, asOfDate);
    }

    dto.instanceCount = stats.instanceCount;
    dto.completedInstanceCount = stats.completedInstanceCount;
    dto.pendingInstanceCount = stats.pendingInstanceCount;
    dto.dueInstanceCount = stats.dueInstanceCount;
    dto.completedDueInstanceCount = stats.completedDueInstanceCount;
    dto.completionWindowDays = stats.completionWindowDays;
    dto.futurePendingInstanceCount = stats.futurePendingInstanceCount;
    dto.singleInstanceStatus = stats.singleInstanceStatus;
    dto.completionRate = stats.completionRate;

    if (includeChildren) {
      dto.instances = (await loadOccurrences()).map((occurrence) =>
        occurrence.toClientDTOAt(timeContext, asOf),
      );
    }

    return ok(dto);
  }

  private calculateStats(
    templateId: string,
    occurrences: TaskOccurrence[],
    windowStart: Ymd,
    asOf: Ymd,
  ): TaskPlanInstanceStats {
    const completedInstanceCount = occurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Completed,
    ).length;
    const pendingInstanceCount = occurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Pending,
    ).length;
    const dueOccurrences = occurrences.filter(
      (occurrence) => occurrence.scheduleDate >= windowStart && occurrence.scheduleDate <= asOf,
    );
    const completedDueInstanceCount = dueOccurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Completed,
    ).length;

    return {
      templateId,
      instanceCount: occurrences.length,
      completedInstanceCount,
      pendingInstanceCount,
      dueInstanceCount: dueOccurrences.length,
      completedDueInstanceCount,
      completionWindowDays: 30,
      futurePendingInstanceCount: occurrences.filter(
        (occurrence) =>
          occurrence.status === TaskOccurrenceStatus.Pending && occurrence.scheduleDate > asOf,
      ).length,
      singleInstanceStatus: occurrences.length === 1 ? occurrences[0].status : null,
      completionRate:
        dueOccurrences.length > 0
          ? Math.round((completedDueInstanceCount / dueOccurrences.length) * 100)
          : 0,
    };
  }
}
