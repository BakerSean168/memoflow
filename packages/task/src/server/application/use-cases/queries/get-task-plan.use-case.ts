/**
 * Get Task Plan Service
 *
 * TaskPlan is loaded as one aggregate. Occurrence children/statistics are composed
 * explicitly from the TaskOccurrence owner instead of being hydrated into TaskPlan.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type {
  ITaskOccurrenceRepository,
  TaskPlanOccurrenceStats,
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
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    id: string,
    identityId: string,
  ): Promise<Result<GetTaskPlanRes>> {
    const plan = await this.planRepository.findByIdForIdentity(identityId, id);
    if (!plan) {
      return ok(null);
    }

    const asOf = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const windowStart = taskTime.calendar.toYmd(taskTime.calendar.addDays(asOf, -29));
    const asOfDate = taskTime.calendar.toYmd(asOf);
    const dto = plan.toClientDTOAt(timeContext, false, asOf);

    let occurrences: TaskOccurrence[] | null = null;
    const loadOccurrences = async (): Promise<TaskOccurrence[]> => {
      if (occurrences === null) {
        occurrences = (await this.occurrenceRepository.findByPlanId(id, identityId)) ?? [];
      }
      return occurrences;
    };

    let stats: TaskPlanOccurrenceStats | undefined = ((await this.occurrenceRepository.getPlanStats(
      [id],
      identityId,
      { windowStart, asOf: asOfDate },
    )) ?? {})[id];

    if (!stats) {
      stats = this.calculateStats(id, await loadOccurrences(), windowStart, asOfDate);
    }

    dto.occurrenceCount = stats.occurrenceCount;
    dto.completedOccurrenceCount = stats.completedOccurrenceCount;
    dto.pendingOccurrenceCount = stats.pendingOccurrenceCount;
    dto.dueOccurrenceCount = stats.dueOccurrenceCount;
    dto.completedDueOccurrenceCount = stats.completedDueOccurrenceCount;
    dto.completionWindowDays = stats.completionWindowDays;
    dto.futurePendingOccurrenceCount = stats.futurePendingOccurrenceCount;
    dto.singleOccurrenceStatus = stats.singleOccurrenceStatus;
    dto.completionRate = stats.completionRate;

    return ok(dto);
  }

  private calculateStats(
    planId: string,
    occurrences: TaskOccurrence[],
    windowStart: Ymd,
    asOf: Ymd,
  ): TaskPlanOccurrenceStats {
    const completedOccurrenceCount = occurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Completed,
    ).length;
    const pendingOccurrenceCount = occurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Pending,
    ).length;
    const dueOccurrences = occurrences.filter(
      (occurrence) => occurrence.scheduleDate >= windowStart && occurrence.scheduleDate <= asOf,
    );
    const completedDueOccurrenceCount = dueOccurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Completed,
    ).length;

    return {
      planId,
      occurrenceCount: occurrences.length,
      completedOccurrenceCount,
      pendingOccurrenceCount,
      dueOccurrenceCount: dueOccurrences.length,
      completedDueOccurrenceCount,
      completionWindowDays: 30,
      futurePendingOccurrenceCount: occurrences.filter(
        (occurrence) =>
          occurrence.status === TaskOccurrenceStatus.Pending && occurrence.scheduleDate > asOf,
      ).length,
      singleOccurrenceStatus: occurrences.length === 1 ? occurrences[0].status : null,
      completionRate:
        dueOccurrences.length > 0
          ? Math.round((completedDueOccurrenceCount / dueOccurrences.length) * 100)
          : 0,
    };
  }
}
