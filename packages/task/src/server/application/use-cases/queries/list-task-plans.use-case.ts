/**
 * List Task Plans Service
 *
 * Collection reads are bounded and repository-filtered. Occurrence materialization
 * remains owned by the maintenance runtime; this query only adds read projections.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { QueryTaskPlansInternal, QueryTaskPlansRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class ListTaskPlansUseCase {
  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(request: QueryTaskPlansInternal): Promise<Result<QueryTaskPlansRes>> {
    const page = request.page ?? DEFAULT_PAGE;
    const limit = request.limit ?? DEFAULT_LIMIT;
    const { plans, total } = await this.planRepository.findPage(request.identityId, {
      ...(request.status?.length ? { status: request.status } : {}),
      ...(request.outcome?.length ? { outcome: request.outcome } : {}),
      ...(request.archiveState ? { archiveState: request.archiveState } : {}),
      ...(request.goalId ? { goalId: String(request.goalId) } : {}),
      ...(request.keyResultId ? { keyResultId: String(request.keyResultId) } : {}),
      ...(request.labelIdsAll?.length ? { labelIdsAll: request.labelIdsAll } : {}),
      limit,
      offset: (page - 1) * limit,
    });

    // Completion statistics use the same identity-scoped Product Time window
    // in both Prisma and PowerSync lanes, but only for the bounded result page.
    const asOf = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(request.identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const windowStart = taskTime.calendar.toYmd(taskTime.calendar.addDays(asOf, -29));
    const asOfDate = taskTime.calendar.toYmd(asOf);
    const statsByTemplateId =
      plans.length === 0
        ? {}
        : ((await this.occurrenceRepository.getPlanStats(
            plans.map((plan) => plan.id),
            request.identityId,
            { windowStart, asOf: asOfDate },
          )) ?? {});

    return ok({
      plans: plans.map((plan) => {
        const dto = plan.toClientDTOAt(timeContext, false, asOf);
        const stats = statsByTemplateId[plan.id];

        if (!stats) {
          return dto;
        }

        return {
          ...dto,
          occurrenceCount: stats.occurrenceCount,
          completedOccurrenceCount: stats.completedOccurrenceCount,
          pendingOccurrenceCount: stats.pendingOccurrenceCount,
          dueOccurrenceCount: stats.dueOccurrenceCount,
          completedDueOccurrenceCount: stats.completedDueOccurrenceCount,
          completionWindowDays: stats.completionWindowDays,
          futurePendingOccurrenceCount: stats.futurePendingOccurrenceCount,
          singleOccurrenceStatus: stats.singleOccurrenceStatus,
          completionRate: stats.completionRate,
        };
      }),
      total,
    });
  }
}
